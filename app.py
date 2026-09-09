import os
import logging
import sqlite3
import datetime
import pyodbc
import pandas as pd
from flask import Flask, jsonify, render_template, request
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s in %(module)s: %(message)s"
)
log = logging.getLogger("stopsale")

app = Flask(__name__)

# Config variables
CONN_STR = os.getenv(
    "DB_CONNECTION_STRING",
    "DRIVER={ODBC Driver 18 for SQL Server};SERVER=192.168.0.41,1433;DATABASE=SednaAdakoy;UID=gokhan;PWD=Ad!!2025!!;TrustServerCertificate=yes;"
)
PORT = int(os.getenv("PORT", 8095))
TARGET_YEAR = int(os.getenv("TARGET_YEAR", 2026))

# Path for local SQLite planning database
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "stopsale.db")

# Initialize SQLite database
def init_sqlite_db():
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Local planned stopsales table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS local_stopsales (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                begin_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                room_type TEXT NOT NULL, -- 'ALL' or specific room type code
                remark TEXT,
                is_active INTEGER DEFAULT 1,
                created_at TEXT NOT NULL
            )
        """)
        
        # Application settings table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)
        
        # Set default settings (Default 90% threshold for stopsale)
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('threshold_pct', '90.0')")
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('buffer_rooms', '2')")
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('default_year', '2026')")
        
        conn.commit()
        conn.close()
        log.info("Local SQLite database initialized successfully.")
    except Exception as e:
        log.error(f"Failed to initialize SQLite database: {e}")

# Call DB initialization
init_sqlite_db()

# SQL Connection helper
def get_sql_conn():
    return pyodbc.connect(CONN_STR, timeout=15)

# Fetch settings from SQLite
def get_app_settings():
    settings = {
        'threshold_pct': 90.0,
        'buffer_rooms': 2,
        'default_year': TARGET_YEAR
    }
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT key, value FROM settings")
        for key, val in cursor.fetchall():
            if key == 'threshold_pct':
                settings[key] = float(val)
            elif key == 'buffer_rooms':
                settings[key] = int(val)
            elif key == 'default_year':
                settings[key] = int(val)
        conn.close()
    except Exception as e:
        log.error(f"Error fetching settings: {e}")
    return settings

# Helper: format date safely as YYYYMMDD string for SQL parameter binding if needed
def to_iso_date(dt):
    if isinstance(dt, str):
        return dt.replace("-", "")
    return dt.strftime("%Y%m%d")

# Helper: Merge room type codes as requested
def merge_room_type(rt):
    if not rt:
        return rt
    rt_str = str(rt).strip()
    if rt_str == 'STD-LVL':
        return 'STD-LV'
    if rt_str == 'STD-SVL':
        return 'STD-SV'
    return rt_str

@app.route('/')
def index():
    return render_template('index.html')

# API: Get Current App Settings
@app.route('/api/settings', methods=['GET', 'POST'])
def handle_settings():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    if request.method == 'POST':
        try:
            data = request.json
            if 'threshold_pct' in data:
                cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('threshold_pct', ?)", (str(float(data['threshold_pct'])),))
            if 'buffer_rooms' in data:
                cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('buffer_rooms', ?)", (str(int(data['buffer_rooms'])),))
            if 'default_year' in data:
                cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('default_year', ?)", (str(int(data['default_year'])),))
            conn.commit()
            log.info("Settings updated successfully.")
            return jsonify({'success': True, 'message': 'Ayarlar kaydedildi.'})
        except Exception as e:
            log.error(f"Error saving settings: {e}")
            return jsonify({'success': False, 'error': str(e)}), 400
        finally:
            conn.close()
    else:
        settings = get_app_settings()
        conn.close()
        return jsonify(settings)

# API: Manage Local Stopsales
@app.route('/api/local_stopsales', methods=['GET', 'POST', 'DELETE'])
def handle_local_stopsales():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    if request.method == 'POST':
        try:
            data = request.json
            begin_date = data.get('begin_date') # YYYY-MM-DD
            end_date = data.get('end_date') # YYYY-MM-DD
            room_type = data.get('room_type', 'ALL')
            remark = data.get('remark', '')
            
            if not begin_date or not end_date:
                return jsonify({'success': False, 'error': 'Başlangıç ve bitiş tarihleri zorunludur.'}), 400
                
            now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cursor.execute("""
                INSERT INTO local_stopsales (begin_date, end_date, room_type, remark, is_active, created_at)
                VALUES (?, ?, ?, ?, 1, ?)
            """, (begin_date, end_date, room_type, remark, now_str))
            
            conn.commit()
            return jsonify({'success': True, 'message': 'Planlanan Stopsale eklendi.'})
        except Exception as e:
            log.error(f"Error adding local stopsale: {e}")
            return jsonify({'success': False, 'error': str(e)}), 400
        finally:
            conn.close()
            
    elif request.method == 'DELETE':
        try:
            id_to_delete = request.args.get('id')
            if not id_to_delete:
                return jsonify({'success': False, 'error': 'ID gereklidir.'}), 400
                
            cursor.execute("DELETE FROM local_stopsales WHERE id = ?", (id_to_delete,))
            conn.commit()
            return jsonify({'success': True, 'message': 'Stopsale silindi.'})
        except Exception as e:
            log.error(f"Error deleting local stopsale: {e}")
            return jsonify({'success': False, 'error': str(e)}), 400
        finally:
            conn.close()
            
    else: # GET
        try:
            cursor.execute("SELECT id, begin_date, end_date, room_type, remark, is_active, created_at FROM local_stopsales ORDER BY begin_date ASC")
            rows = cursor.fetchall()
            stopsales_list = []
            for r in rows:
                stopsales_list.append({
                    'id': r[0],
                    'begin_date': r[1],
                    'end_date': r[2],
                    'room_type': r[3],
                    'remark': r[4],
                    'is_active': bool(r[5]),
                    'created_at': r[6]
                })
            return jsonify(stopsales_list)
        except Exception as e:
            log.error(f"Error getting local stopsales: {e}")
            return jsonify({'error': str(e)}), 500
        finally:
            conn.close()

# API: Dynamic Room Capacities from SQL
@app.route('/api/room_capacities')
def get_room_capacities_endpoint():
    try:
        sql_conn = get_sql_conn()
        
        q = """
            SELECT 
                r.RoomTypeCode as room_type,
                COUNT(r.RecId) as capacity
            FROM Room r
            LEFT JOIN RoomType rt ON r.RoomTypeCode = rt.RoomTypeCode
            WHERE (r.EndDate IS NULL OR r.EndDate > GETDATE())
              AND r.CompanyRecId = 1
              AND r.ForeCast = 1
              AND (rt.Invisible = 0 OR rt.Invisible IS NULL)
            GROUP BY r.RoomTypeCode
            ORDER BY capacity DESC
        """
        df = pd.read_sql(q, sql_conn)
        sql_conn.close()
        
        # Merge room types
        df['room_type'] = df['room_type'].apply(merge_room_type)
        df = df.groupby('room_type', as_index=False)['capacity'].sum()
        df = df.sort_values(by='capacity', ascending=False)
        
        capacities = df.to_dict(orient='records')
        total_capacity = sum(item['capacity'] for item in capacities)
        
        return jsonify({
            'capacities': capacities,
            'total_capacity': total_capacity
        })
    except Exception as e:
        log.error(f"Error fetching room capacities: {e}")
        return jsonify({'error': str(e)}), 500

# API: Detailed Reservations for a Clicked Date
@app.route('/api/date_details')
def get_date_details():
    stay_date = request.args.get('date') # YYYY-MM-DD format
    if not stay_date:
        return jsonify({'error': 'Tarih parametresi eksik.'}), 400
        
    try:
        sql_conn = get_sql_conn()
        
        q = """
            SELECT 
                r.RecId as rez_id,
                ISNULL(r.Voucher, '') as voucher,
                ISNULL(r.LastName1, '') + ' ' + ISNULL(r.FirstName1, '') as guest_name,
                ISNULL(a.AgencyCode, 'MUNFERIT') as agency,
                dd.RoomType as room_type,
                ISNULL(dd.Room, '') as room_no,
                dd.Pax as adult,
                dd.PaidChild + dd.FreeChild as child,
                dd.Baby as baby,
                CONVERT(varchar(10), r.CheckinDate, 23) as checkin,
                CONVERT(varchar(10), r.CheckOutDate, 23) as checkout,
                DATEDIFF(day, r.CheckinDate, r.CheckOutDate) as nights,
                ISNULL(r.RecordUser, '') as record_user
            FROM DailyDetail dd
            JOIN Reservation r ON r.RecId = dd.ReservationId
            LEFT JOIN Agency a ON a.RecId = r.AgencyId
            WHERE dd.Status != -1 AND r.Status != -1
              AND CAST(dd.StayDate AS DATE) = ?
            ORDER BY dd.RoomType, guest_name
        """
        cursor = sql_conn.cursor()
        cursor.execute(q, (stay_date,))
        cols = [c[0] for c in cursor.description]
        rows = [dict(zip(cols, row)) for row in cursor.fetchall()]
        
        sql_conn.close()
        
        # Merge room types in the guest list for UI consistency
        for r in rows:
            r['room_type'] = merge_room_type(r['room_type'])
            
        return jsonify(rows)
    except Exception as e:
        log.error(f"Error fetching details for date {stay_date}: {e}")
        return jsonify({'error': str(e)}), 500

# API: Core Stopsale Audit Data
@app.route('/api/occupancy')
def get_occupancy_data():
    settings = get_app_settings()
    year = settings['default_year']
    
    start_date_str = request.args.get('start_date', f"{year}-06-01")
    end_date_str = request.args.get('end_date', f"{year}-10-31")
    
    threshold_pct = settings['threshold_pct']
    buffer_rooms = settings['buffer_rooms']
    
    try:
        # 1. Fetch Room Capacities from SQL
        sql_conn = get_sql_conn()
        
        cap_q = """
            SELECT 
                r.RoomTypeCode as room_type,
                COUNT(r.RecId) as capacity
            FROM Room r
            LEFT JOIN RoomType rt ON r.RoomTypeCode = rt.RoomTypeCode
            WHERE (r.EndDate IS NULL OR r.EndDate > GETDATE())
              AND r.CompanyRecId = 1
              AND r.ForeCast = 1
              AND (rt.Invisible = 0 OR rt.Invisible IS NULL)
            GROUP BY r.RoomTypeCode
        """
        df_cap = pd.read_sql(cap_q, sql_conn)
        
        # Merge standard room types (STD-LVL -> STD-LV, STD-SVL -> STD-SV)
        df_cap['room_type'] = df_cap['room_type'].apply(merge_room_type)
        df_cap = df_cap.groupby('room_type', as_index=False)['capacity'].sum()
        
        capacities = dict(zip(df_cap['room_type'], df_cap['capacity']))
        total_capacity = sum(capacities.values())
        
        # 2. Fetch Live Occupancies Day-by-Day (Total & Per Room Type)
        start_iso = start_date_str.replace("-", "")
        end_iso = end_date_str.replace("-", "")
        
        occ_q = f"""
            SELECT 
                CAST(dd.StayDate AS DATE) as stay_date,
                dd.RoomType as room_type,
                COUNT(dd.RecId) as sold_rooms
            FROM DailyDetail dd
            JOIN Reservation r ON r.RecId = dd.ReservationId
            WHERE dd.StayDate BETWEEN '{start_iso}' AND '{end_iso}'
              AND dd.Status != -1 AND r.Status != -1
            GROUP BY CAST(dd.StayDate AS DATE), dd.RoomType
            ORDER BY stay_date, room_type
        """
        df_occ = pd.read_sql(occ_q, sql_conn)
        
        # 3. Fetch Stopsales already configured in Sedna's tables
        sedna_stopsales_q = """
            SELECT 
                CAST(sd.BeginDate AS DATE) as begin_date,
                CAST(sd.EndDate AS DATE) as end_date,
                sd.StopSale as is_stopsale,
                sd.AllRoomTypes as all_room_types,
                srt.RoomType as room_type,
                sd.Remark as remark
            FROM StopSaleDate sd
            LEFT JOIN StopSaleRoomType srt ON srt.OwnerId = sd.RecId
            WHERE sd.CompanyRecId = 1
              AND sd.StopSale = 1
        """
        df_sedna_ss = pd.read_sql(sedna_stopsales_q, sql_conn)
        sql_conn.close()
        
        # 4. Fetch Local Planned Stopsales from SQLite
        sqlite_conn = sqlite3.connect(DB_PATH)
        local_ss_df = pd.read_sql_query("SELECT begin_date, end_date, room_type, remark FROM local_stopsales WHERE is_active = 1", sqlite_conn)
        sqlite_conn.close()
        
        # Process dates range list
        start_date = datetime.datetime.strptime(start_date_str, "%Y-%m-%d").date()
        end_date = datetime.datetime.strptime(end_date_str, "%Y-%m-%d").date()
        delta = end_date - start_date
        
        dates_list = [start_date + datetime.timedelta(days=i) for i in range(delta.days + 1)]
        
        # Pivot occupancies: index = stay_date, columns = room_type, value = sold_rooms
        if not df_occ.empty:
            df_occ['stay_date'] = pd.to_datetime(df_occ['stay_date']).dt.date
            df_occ['room_type'] = df_occ['room_type'].apply(merge_room_type)
            df_occ = df_occ.groupby(['stay_date', 'room_type'], as_index=False)['sold_rooms'].sum()
            df_pivot = df_occ.pivot_table(index='stay_date', columns='room_type', values='sold_rooms', aggfunc='sum').fillna(0).astype(int)
        else:
            df_pivot = pd.DataFrame()
            
        # Helper: check Sedna stopsale
        def check_sedna_stopsale(target_date, target_room_type):
            if df_sedna_ss.empty:
                return False, ""
            
            mask = (pd.to_datetime(df_sedna_ss['begin_date']).dt.date <= target_date) & \
                   (pd.to_datetime(df_sedna_ss['end_date']).dt.date >= target_date)
            active_ss = df_sedna_ss[mask]
            
            for _, row in active_ss.iterrows():
                if row['all_room_types'] == 1:
                    return True, f"Sedna (Tüm Odalar): {row['remark']}"
                
                row_rt = row['room_type']
                if target_room_type == "Standard Oda (Tüm STD'ler dahil)":
                    if 'STD' in str(row_rt):
                        return True, f"Sedna ({row_rt}): {row['remark']}"
                elif target_room_type == "Club Oda (Tüm Club'lar dahil)":
                    if 'CLUB' in str(row_rt):
                        return True, f"Sedna ({row_rt}): {row['remark']}"
                else:
                    if row_rt == target_room_type or \
                       (target_room_type == 'STD-LV' and row_rt == 'STD-LVL') or \
                       (target_room_type == 'STD-SV' and row_rt == 'STD-SVL'):
                        return True, f"Sedna ({row_rt}): {row['remark']}"
            return False, ""
            
        # Helper: check Local stopsale
        def check_local_stopsale(target_date, target_room_type):
            if local_ss_df.empty:
                return False, ""
                
            mask = (pd.to_datetime(local_ss_df['begin_date']).dt.date <= target_date) & \
                   (pd.to_datetime(local_ss_df['end_date']).dt.date >= target_date)
            active_ss = local_ss_df[mask]
            
            for _, row in active_ss.iterrows():
                rt = row['room_type']
                if rt == 'ALL':
                    return True, f"Planlanan (Tüm Odalar): {row['remark']}"
                
                if target_room_type == "Standard Oda (Tüm STD'ler dahil)":
                    if 'STD' in str(rt) or rt == "Standard Oda (Tüm STD'ler dahil)":
                        return True, f"Planlanan ({rt}): {row['remark']}"
                elif target_room_type == "Club Oda (Tüm Club'lar dahil)":
                    if 'CLUB' in str(rt) or rt == "Club Oda (Tüm Club'lar dahil)":
                        return True, f"Planlanan ({rt}): {row['remark']}"
                else:
                    if rt == target_room_type or \
                       (target_room_type == 'STD-LV' and rt == 'STD-LVL') or \
                       (target_room_type == 'STD-SV' and rt == 'STD-SVL') or \
                       (rt == "Standard Oda (Tüm STD'ler dahil)" and 'STD' in target_room_type) or \
                       (rt == "Club Oda (Tüm Club'lar dahil)" and 'CLUB' in target_room_type):
                        return True, f"Planlanan ({rt}): {row['remark']}"
            return False, ""
            
        # Main processing
        processed_data = []
        critical_dates_count = 0
        total_occupancy_sum = 0
        
        # Unique list of active room types that have capacity
        individual_room_types = list(capacities.keys())
        
        # Virtual room types to add
        virtual_groups = ["Standard Oda (Tüm STD'ler dahil)", "Club Oda (Tüm Club'lar dahil)"]
        all_room_types = virtual_groups + individual_room_types
        
        # Calculate capacities for virtual groups
        std_capacity = sum(cap for rt, cap in capacities.items() if 'STD' in rt)
        club_capacity = sum(cap for rt, cap in capacities.items() if 'CLUB' in rt)
        capacities["Standard Oda (Tüm STD'ler dahil)"] = std_capacity
        capacities["Club Oda (Tüm Club'lar dahil)"] = club_capacity
        
        today = datetime.date.today()
        
        for d in dates_list:
            is_past = d < today
            row_data = {
                'date': d.strftime("%Y-%m-%d"),
                'day_name': d.strftime("%a"),
                'sold_total': 0,
                'capacity_total': total_capacity,
                'occupancy_pct': 0.0,
                'room_types': {},
                'stopsales_sedna': [],
                'stopsales_local': [],
                'alert_level': 'normal', # normal, warn, danger, stopsale
                'needs_stopsale': False,
                'has_overbook': False,
                'overbooked_rooms': [],
                'full_rooms': [],
                'high_occ_rooms': [],
                'stopsale_applied': False,
                'stopsale_details': [],
                'is_past': is_past
            }
            
            # Check Sedna & Local hotel-wide stopsales
            has_hotel_sedna_ss, remark_sedna = check_sedna_stopsale(d, 'ALL')
            has_hotel_local_ss, remark_local = check_local_stopsale(d, 'ALL')
            
            if has_hotel_sedna_ss:
                row_data['stopsales_sedna'].append('ALL')
                row_data['stopsale_details'].append(remark_sedna)
                row_data['stopsale_applied'] = True
            if has_hotel_local_ss:
                row_data['stopsales_local'].append('ALL')
                row_data['stopsale_details'].append(remark_local)
                row_data['stopsale_applied'] = True
                
            sold_total = 0
            room_type_details = {}
            
            # Fill occupancy per individual room type first
            for rt in individual_room_types:
                cap = capacities[rt]
                sold = 0
                if d in df_pivot.index and rt in df_pivot.columns:
                    sold = int(df_pivot.loc[d, rt])
                
                sold_total += sold
                
                # Check stopsales for this specific room type
                has_rt_sedna_ss, rt_remark_sedna = check_sedna_stopsale(d, rt)
                has_rt_local_ss, rt_remark_local = check_local_stopsale(d, rt)
                
                rt_ss_applied = False
                rt_ss_details = []
                
                if has_rt_sedna_ss:
                    row_data['stopsales_sedna'].append(rt)
                    rt_ss_details.append(rt_remark_sedna)
                    rt_ss_applied = True
                    row_data['stopsale_applied'] = True
                if has_rt_local_ss:
                    row_data['stopsales_local'].append(rt)
                    rt_ss_details.append(rt_remark_local)
                    rt_ss_applied = True
                    row_data['stopsale_applied'] = True
                
                rt_occ_pct = (sold / cap * 100) if cap > 0 else 0
                rt_needs_ss = False
                rt_reason = ""
                
                if not is_past and cap > 0:
                    if sold > cap:
                        rt_needs_ss = True
                        rt_reason = f"Overbook! ({sold}/{cap} oda satıldı - %{rt_occ_pct:.1f})"
                    elif sold == cap:
                        rt_needs_ss = True
                        rt_reason = f"Dolu! ({sold}/{cap} oda satıldı)"
                    elif rt_occ_pct >= threshold_pct:
                        rt_needs_ss = True
                        rt_reason = f"Yüksek Doluluk! (%{rt_occ_pct:.0f} >= %{threshold_pct:.0f})"
                
                if rt_needs_ss:
                    if rt_ss_details:
                        row_data['stopsale_details'].extend(rt_ss_details)
                    else:
                        row_data['stopsale_details'].append(f"Öneri ({rt}): {rt_reason}")
                
                room_type_details[rt] = {
                    'sold': sold,
                    'capacity': cap,
                    'occupancy_pct': round(rt_occ_pct, 1),
                    'needs_stopsale': rt_needs_ss,
                    'stopsale_applied': rt_ss_applied,
                    'stopsale_details': rt_ss_details
                }
            
            # Fill occupancy for virtual group room types
            for vg in virtual_groups:
                keyword = 'STD' if 'STD' in vg else 'CLUB'
                vg_rts = [rt for rt in individual_room_types if keyword in rt]
                
                vg_sold = sum(room_type_details[rt]['sold'] for rt in vg_rts)
                vg_cap = capacities[vg]
                vg_occ_pct = (vg_sold / vg_cap * 100) if vg_cap > 0 else 0
                
                vg_ss_applied = any(room_type_details[rt]['stopsale_applied'] for rt in vg_rts)
                has_vg_sedna_ss, vg_remark_sedna = check_sedna_stopsale(d, vg)
                has_vg_local_ss, vg_remark_local = check_local_stopsale(d, vg)
                
                vg_ss_details = []
                if has_vg_sedna_ss:
                    vg_ss_details.append(vg_remark_sedna)
                    vg_ss_applied = True
                    row_data['stopsale_applied'] = True
                if has_vg_local_ss:
                    vg_ss_details.append(vg_remark_local)
                    vg_ss_applied = True
                    row_data['stopsale_applied'] = True
                
                for rt in vg_rts:
                    vg_ss_details.extend(room_type_details[rt]['stopsale_details'])
                vg_ss_details = list(set(vg_ss_details))
                
                vg_needs_ss = False
                vg_reason = ""
                
                if not is_past and vg_cap > 0:
                    if vg_sold > vg_cap:
                        vg_needs_ss = True
                        vg_reason = f"Overbook! ({vg_sold}/{vg_cap} oda satıldı)"
                    elif vg_sold == vg_cap:
                        vg_needs_ss = True
                        vg_reason = f"Dolu! ({vg_sold}/{vg_cap} oda satıldı)"
                    elif vg_occ_pct >= threshold_pct:
                        vg_needs_ss = True
                        vg_reason = f"Yüksek Doluluk! (%{vg_occ_pct:.0f} >= %{threshold_pct:.0f})"
                
                room_type_details[vg] = {
                    'sold': vg_sold,
                    'capacity': vg_cap,
                    'occupancy_pct': round(vg_occ_pct, 1),
                    'needs_stopsale': vg_needs_ss,
                    'stopsale_applied': vg_ss_applied,
                    'stopsale_details': vg_ss_details
                }
            
            # Set total hotel occupancy metrics
            row_data['sold_total'] = sold_total
            hotel_occ_pct = (sold_total / total_capacity * 100) if total_capacity > 0 else 0
            row_data['occupancy_pct'] = round(hotel_occ_pct, 1)
            row_data['room_types'] = room_type_details
            
            # Detect overbooked, full, and high occupancy room types
            has_overbook = False
            overbooked_rooms = []
            full_rooms = []
            high_occ_rooms = []
            
            for rt in individual_room_types:
                data = room_type_details[rt]
                if data['capacity'] > 0:
                    if data['sold'] > data['capacity']:
                        has_overbook = True
                        diff = data['sold'] - data['capacity']
                        overbooked_rooms.append(f"{rt}: {data['sold']}/{data['capacity']} (+{diff} Overbook)")
                    elif data['sold'] == data['capacity']:
                        full_rooms.append(f"{rt}: {data['sold']}/{data['capacity']} (Dolu)")
                    elif data['occupancy_pct'] >= threshold_pct:
                        high_occ_rooms.append(f"{rt}: %{data['occupancy_pct']:.0f} (>=%{threshold_pct:.0f})")
            
            row_data['has_overbook'] = has_overbook
            row_data['overbooked_rooms'] = overbooked_rooms
            row_data['full_rooms'] = full_rooms
            row_data['high_occ_rooms'] = high_occ_rooms
            
            # Hotel-wide stopsale requirement (triggers when total hotel reaches threshold e.g. 90%, or total capacity full, OR any room type overbooked)
            hotel_needs_ss = False
            if not is_past and total_capacity > 0:
                if sold_total > total_capacity:
                    hotel_needs_ss = True
                    row_data['stopsale_details'].append(f"Öneri (Tüm Otel): Aşırı Doluluk / Overbook! ({sold_total}/{total_capacity} oda)")
                elif sold_total == total_capacity:
                    hotel_needs_ss = True
                    row_data['stopsale_details'].append(f"Öneri (Tüm Otel): Tam Kapasite Dolu! ({sold_total}/{total_capacity} oda)")
                elif hotel_occ_pct >= threshold_pct:
                    hotel_needs_ss = True
                    row_data['stopsale_details'].append(f"Öneri (Tüm Otel): Yüksek Doluluk! (%{hotel_occ_pct:.1f} >= %{threshold_pct:.1f})")
                elif has_overbook:
                    hotel_needs_ss = True
            
            row_data['needs_stopsale'] = hotel_needs_ss
            
            # Determine overall Alert Level for styling
            if row_data['stopsale_applied']:
                row_data['alert_level'] = 'stopsale'
            elif has_overbook or (not is_past and hotel_occ_pct >= threshold_pct) or (not is_past and sold_total >= total_capacity):
                row_data['alert_level'] = 'danger'
                critical_dates_count += 1
            elif len(full_rooms) > 0 or len(high_occ_rooms) > 0 or hotel_occ_pct >= 70.0:
                row_data['alert_level'] = 'warn'
            elif hotel_occ_pct >= 40.0:
                row_data['alert_level'] = 'normal-high'
            else:
                row_data['alert_level'] = 'normal'
                
            total_occupancy_sum += hotel_occ_pct
            processed_data.append(row_data)
            
        # Summary calculations
        avg_occupancy = (total_occupancy_sum / len(dates_list)) if dates_list else 0
        active_stopsales_count = sum(1 for r in processed_data if r['stopsale_applied'])
        
        return jsonify({
            'dates': processed_data,
            'summary': {
                'total_dates': len(processed_data),
                'critical_dates_count': critical_dates_count,
                'active_stopsales_count': active_stopsales_count,
                'avg_occupancy': round(avg_occupancy, 1),
                'hotel_capacity': total_capacity,
                'room_types': all_room_types,
                'room_type_capacities': capacities,
                'threshold_pct': threshold_pct,
                'buffer_rooms': buffer_rooms
            }
        })
    except Exception as e:
        log.error(f"Error fetching occupancy data: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    log.info(f"Starting Stopsale Dashboard Server on port {PORT}...")
    app.run(host='0.0.0.0', port=PORT, debug=True)
