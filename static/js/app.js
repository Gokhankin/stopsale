// Stopsale Dashboard Javascript Application
document.addEventListener("DOMContentLoaded", function() {
    
    // Global state
    let appData = null;
    let localStopsales = [];
    let activeFilters = {
        startDate: "2026-06-01",
        endDate: "2026-10-31",
        roomType: "ALL",
        status: "ALL"
    };

    // DOM Elements
    const elements = {
        syncTime: document.getElementById("sync-time"),
        valTotalDates: document.getElementById("val-total-dates"),
        valAvgOcc: document.getElementById("val-avg-occ"),
        valCriticalDates: document.getElementById("val-critical-dates"),
        valActiveStopsales: document.getElementById("val-active-stopsales"),
        
        filterStartDate: document.getElementById("filter-start-date"),
        filterEndDate: document.getElementById("filter-end-date"),
        filterRoomType: document.getElementById("filter-room-type"),
        filterStatus: document.getElementById("filter-status"),
        btnApplyFilters: document.getElementById("btn-apply-filters"),
        
        calendarHeatmap: document.getElementById("calendar-heatmap"),
        auditTableBody: document.getElementById("audit-table-body"),
        btnExportExcel: document.getElementById("btn-export-excel"),
        
        // Modals
        modalSettings: document.getElementById("modal-settings"),
        modalLocalManager: document.getElementById("modal-local-manager"),
        modalDateDetails: document.getElementById("modal-date-details"),
        
        btnSettings: document.getElementById("btn-settings"),
        btnManageLocal: document.getElementById("btn-manage-local"),
        
        formSettings: document.getElementById("form-settings"),
        formLocalStopsale: document.getElementById("form-local-stopsale"),
        
        // Modal detail fields
        detailDateTitle: document.getElementById("detail-date-title"),
        detailDateBadge: document.getElementById("detail-date-badge"),
        detailOccupancyBars: document.getElementById("detail-occupancy-bars"),
        detailAlertBox: document.getElementById("detail-alert-box"),
        detailGuestCount: document.getElementById("detail-guest-count"),
        detailGuestTbody: document.getElementById("detail-guest-tbody"),
        localStopsalesTbody: document.getElementById("local-stopsales-tbody"),
        
        // Local stopsale form fields
        lsRoomType: document.getElementById("ls-room-type")
    };

    // Turkish Translations
    const TR_MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
    const TR_WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

    // Initialize application
    function init() {
        setupEventListeners();
        loadSettings();
        refreshAllData();
    }

    // Setup Event Listeners
    function setupEventListeners() {
        // Modal toggling
        elements.btnSettings.addEventListener("click", () => openModal(elements.modalSettings));
        elements.btnManageLocal.addEventListener("click", () => {
            loadLocalStopsales();
            openModal(elements.modalLocalManager);
        });
        
        // Close modal buttons
        document.querySelectorAll(".modal-close").forEach(btn => {
            btn.addEventListener("click", function() {
                const modal = this.closest(".modal-backdrop");
                closeModal(modal);
            });
        });
        
        // Filter actions
        elements.btnApplyFilters.addEventListener("click", function() {
            activeFilters.startDate = elements.filterStartDate.value;
            activeFilters.endDate = elements.filterEndDate.value;
            activeFilters.roomType = elements.filterRoomType.value;
            activeFilters.status = elements.filterStatus.value;
            refreshAllData();
        });
        
        // Form submits
        elements.formSettings.addEventListener("submit", saveSettings);
        elements.formLocalStopsale.addEventListener("submit", saveLocalStopsalePlan);
        
        // CSV export
        elements.btnExportExcel.addEventListener("click", exportAuditToCSV);
    }

    // Modal Helpers
    function openModal(modal) {
        modal.classList.add("open");
    }

    function closeModal(modal) {
        modal.classList.remove("open");
    }

    // Fetch and save settings
    function loadSettings() {
        fetch("/api/settings")
            .then(res => res.json())
            .then(data => {
                document.getElementById("setting-threshold").value = data.threshold_pct;
                document.getElementById("setting-buffer").value = data.buffer_rooms;
                document.getElementById("setting-year").value = data.default_year;
                
                // Pre-populate date filters year
                const year = data.default_year;
                elements.filterStartDate.value = `${year}-06-01`;
                elements.filterEndDate.value = `${year}-10-31`;
                activeFilters.startDate = `${year}-06-01`;
                activeFilters.endDate = `${year}-10-31`;
            })
            .catch(err => console.error("Error loading settings:", err));
    }

    function saveSettings(e) {
        e.preventDefault();
        const settings = {
            threshold_pct: parseFloat(document.getElementById("setting-threshold").value),
            buffer_rooms: parseInt(document.getElementById("setting-buffer").value),
            default_year: parseInt(document.getElementById("setting-year").value)
        };
        
        fetch("/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(settings)
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                closeModal(elements.modalSettings);
                alert("Ayarlar kaydedildi, veriler güncelleniyor...");
                refreshAllData();
            } else {
                alert("Ayarlar kaydedilemedi: " + data.error);
            }
        })
        .catch(err => console.error("Error saving settings:", err));
    }

    // Main Data Fetch
    function refreshAllData() {
        const queryParams = new URLSearchParams({
            start_date: activeFilters.startDate,
            end_date: activeFilters.endDate
        });
        
        // Show loading spinners
        elements.calendarHeatmap.innerHTML = `<div class="loading-spinner"><i class="fa-solid fa-spinner fa-spin"></i> Veriler Yükleniyor...</div>`;
        elements.auditTableBody.innerHTML = `<tr><td colspan="7" class="text-center"><i class="fa-solid fa-spinner fa-spin"></i> Veriler Yükleniyor...</td></tr>`;
        
        fetch(`/api/occupancy?${queryParams.toString()}`)
            .then(res => res.json())
            .then(data => {
                appData = data;
                
                // Set last sync time
                elements.syncTime.textContent = new Date().toLocaleTimeString("tr-TR");
                
                // Populate Filter Room Type select options if not loaded
                populateRoomTypeOptions(data.summary.room_types);
                
                // Populate KPIs
                elements.valTotalDates.textContent = data.summary.total_dates;
                elements.valAvgOcc.textContent = `${data.summary.avg_occupancy}%`;
                elements.valCriticalDates.textContent = data.summary.critical_dates_count;
                elements.valActiveStopsales.textContent = data.summary.active_stopsales_count;
                
                // Render view components
                renderCalendarHeatmap(data.dates, data.summary);
                renderAuditTable(data.dates, data.summary);
            })
            .catch(err => {
                console.error("Error refreshing data:", err);
                elements.calendarHeatmap.innerHTML = `<div class="loading-spinner text-danger"><i class="fa-solid fa-triangle-exclamation"></i> Veri yükleme hatası. Lütfen bağlantıyı kontrol edin.</div>`;
                elements.auditTableBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger"><i class="fa-solid fa-triangle-exclamation"></i> SQL Veritabanına bağlanılamadı.</td></tr>`;
            });
    }

    // Populate Room Type selectors dynamically
    function populateRoomTypeOptions(roomTypes) {
        // Only run once if empty
        if (elements.filterRoomType.options.length > 1) return;
        
        // Populate filter selector
        roomTypes.forEach(rt => {
            const opt = document.createElement("option");
            opt.value = rt;
            opt.textContent = rt;
            elements.filterRoomType.appendChild(opt);
        });

        // Populate local stopsale form selector
        elements.lsRoomType.innerHTML = `<option value="ALL">Tüm Oda Tipleri (ALL)</option>`;
        roomTypes.forEach(rt => {
            const opt = document.createElement("option");
            opt.value = rt;
            opt.textContent = rt;
            elements.lsRoomType.appendChild(opt);
        });
    }

    // Render Calendar Heatmap
    function renderCalendarHeatmap(dates, summary) {
        elements.calendarHeatmap.innerHTML = "";
        
        // Group dates by Month
        const monthsData = {};
        dates.forEach(d => {
            const dateObj = new Date(d.date);
            const mKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}`;
            if (!monthsData[mKey]) {
                monthsData[mKey] = [];
            }
            monthsData[mKey].push(d);
        });
        
        // Render each month
        Object.keys(monthsData).sort().forEach(mKey => {
            const monthDates = monthsData[mKey];
            const firstDateObj = new Date(monthDates[0].date);
            const yearNum = firstDateObj.getFullYear();
            const monthIndex = firstDateObj.getMonth();
            
            // Create Month Wrapper element
            const monthWrapper = document.createElement("div");
            monthWrapper.className = "month-wrapper";
            
            // Month title
            const monthTitleVal = `${TR_MONTHS[monthIndex]} ${yearNum}`;
            const monthAvgOcc = calculateMonthAvgOcc(monthDates);
            monthWrapper.innerHTML = `
                <div class="month-title">
                    <span>${monthTitleVal}</span>
                    <span>Ort. Doluluk: %${monthAvgOcc}</span>
                </div>
            `;
            
            // Calendar Grid table
            const grid = document.createElement("div");
            grid.className = "calendar-grid";
            
            // Weekday headers
            TR_WEEKDAYS.forEach(day => {
                const header = document.createElement("div");
                header.className = "day-header";
                header.textContent = day;
                grid.appendChild(header);
            });
            
            // Weekday alignment (calculate day of week for 1st of month)
            // (day + 6) % 7 maps Sunday=0 to Monday=0, Tuesday=1 ... Sunday=6
            const firstDayOfWeek = (new Date(yearNum, monthIndex, 1).getDay() + 6) % 7;
            for (let i = 0; i < firstDayOfWeek; i++) {
                const emptyCell = document.createElement("div");
                emptyCell.className = "day-cell empty";
                grid.appendChild(emptyCell);
            }
            
            // Render Day Cells
            monthDates.forEach(dayData => {
                const dateObj = new Date(dayData.date);
                const dayNum = dateObj.getDate();
                
                const cell = document.createElement("div");
                cell.className = `day-cell`;
                cell.setAttribute("data-date", dayData.date);
                
                // Color cell based on filter parameters
                let stateClass = "state-normal-low";
                let occPct = dayData.occupancy_pct;
                let hasStopsale = false;
                
                const threshold = summary ? summary.threshold_pct : 90.0;
                
                // If filtering by room type, occupancy is specific to room type
                if (activeFilters.roomType !== "ALL") {
                    const rtData = dayData.room_types[activeFilters.roomType];
                    if (rtData) {
                        occPct = rtData.occupancy_pct;
                        hasStopsale = rtData.stopsale_applied;
                        if (rtData.stopsale_applied) {
                            stateClass = "state-stopsale";
                        } else if (rtData.sold > rtData.capacity || rtData.needs_stopsale || occPct >= threshold) {
                            stateClass = "state-danger";
                        } else if (occPct >= 70.0) {
                            stateClass = "state-warn";
                        } else if (occPct >= 40.0) {
                            stateClass = "state-normal-high";
                        } else {
                            stateClass = "state-normal-low";
                        }
                    }
                } else {
                    // Hotelwide metrics
                    hasStopsale = dayData.stopsale_applied;
                    if (dayData.alert_level === "stopsale") {
                        stateClass = "state-stopsale";
                    } else if (dayData.has_overbook || dayData.alert_level === "danger" || occPct >= threshold) {
                        stateClass = "state-danger";
                    } else if (dayData.alert_level === "warn" || occPct >= 70.0 || (dayData.full_rooms && dayData.full_rooms.length > 0)) {
                        stateClass = "state-warn";
                    } else if (occPct >= 40.0) {
                        stateClass = "state-normal-high";
                    } else {
                        stateClass = "state-normal-low";
                    }
                }
                
                cell.classList.add(stateClass);
                
                // Check if has stopsales or overbooks to render indicator
                if (hasStopsale || dayData.stopsales_sedna.length > 0 || dayData.stopsales_local.length > 0) {
                    cell.classList.add("has-ss-indicator");
                }
                
                cell.innerHTML = `<span class="day-num">${dayNum}</span>`;
                
                // Hover details tooltip
                let tooltipText = `${dayData.date}\nDoluluk: %${occPct} (${dayData.sold_total}/${dayData.capacity_total})`;
                if (dayData.has_overbook && dayData.overbooked_rooms) {
                    tooltipText += `\n⚠️ OVERBOOK: ${dayData.overbooked_rooms.join(', ')}`;
                } else if (dayData.full_rooms && dayData.full_rooms.length > 0) {
                    tooltipText += `\n⛔ DOLU: ${dayData.full_rooms.join(', ')}`;
                }
                if (activeFilters.roomType !== "ALL" && dayData.room_types[activeFilters.roomType]) {
                    const rt = dayData.room_types[activeFilters.roomType];
                    tooltipText = `${dayData.date} [${activeFilters.roomType}]\nDoluluk: %${rt.occupancy_pct} (${rt.sold}/${rt.capacity})`;
                }
                cell.title = tooltipText;
                
                // Event listener click details
                cell.addEventListener("click", () => showDateDetails(dayData));
                
                grid.appendChild(cell);
            });
            
            monthWrapper.appendChild(grid);
            elements.calendarHeatmap.appendChild(monthWrapper);
        });
    }

    function calculateMonthAvgOcc(monthDates) {
        if (!monthDates.length) return 0;
        const sum = monthDates.reduce((acc, curr) => acc + curr.occupancy_pct, 0);
        return Math.round(sum / monthDates.length);
    }

    // Render Table Grid
    function renderAuditTable(dates, summary) {
        elements.auditTableBody.innerHTML = "";
        
        const threshold = summary ? summary.threshold_pct : 90.0;
        
        // Filter dates based on current selector filters
        let filteredDates = dates;
        
        // Status filter logic
        if (activeFilters.status !== "ALL") {
            filteredDates = dates.filter(d => {
                if (activeFilters.roomType !== "ALL") {
                    const rt = d.room_types[activeFilters.roomType];
                    if (!rt) return false;
                    if (activeFilters.status === "CRITICAL") return rt.sold > rt.capacity || rt.needs_stopsale || rt.occupancy_pct >= threshold;
                    if (activeFilters.status === "MISSING_STOPSALE") return (rt.sold > rt.capacity || rt.needs_stopsale || rt.occupancy_pct >= threshold) && !rt.stopsale_applied;
                    if (activeFilters.status === "STOPSALE_ACTIVE") return rt.stopsale_applied;
                    if (activeFilters.status === "REOPEN_RECOMMENDED") return rt.stopsale_applied && rt.occupancy_pct < 80.0;
                    if (activeFilters.status === "NORMAL") return rt.sold <= rt.capacity && !rt.needs_stopsale && !rt.stopsale_applied && rt.occupancy_pct < threshold;
                } else {
                    if (activeFilters.status === "CRITICAL") return d.has_overbook || d.needs_stopsale || d.occupancy_pct >= threshold;
                    if (activeFilters.status === "MISSING_STOPSALE") return (d.has_overbook || d.needs_stopsale || d.occupancy_pct >= threshold) && !d.stopsale_applied;
                    if (activeFilters.status === "STOPSALE_ACTIVE") return d.stopsale_applied;
                    if (activeFilters.status === "REOPEN_RECOMMENDED") return d.stopsale_applied && d.occupancy_pct < 80.0;
                    if (activeFilters.status === "NORMAL") return !d.has_overbook && !d.needs_stopsale && !d.stopsale_applied && d.occupancy_pct < threshold;
                }
                return true;
            });
        }
        
        // If room type selected, filter by that room type specifically
        if (activeFilters.roomType !== "ALL") {
            filteredDates = filteredDates.filter(d => {
                const rt = d.room_types[activeFilters.roomType];
                return !!rt;
            });
        }
        
        if (filteredDates.length === 0) {
            elements.auditTableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Arama kriterlerine uygun gün bulunamadı.</td></tr>`;
            return;
        }
        
        filteredDates.forEach(day => {
            const tr = document.createElement("tr");
            
            // 1. Date (Turkish Format)
            const dateStr = formatTurkishDate(day.date);
            
            // 2. Day name
            const dayName = getTurkishDayName(day.day_name);
            
            // 3. Occupancy count
            let sold = day.sold_total;
            let cap = day.capacity_total;
            let occPct = day.occupancy_pct;
            let isStopsaleApplied = day.stopsale_applied;
            let isNeedsStopsale = day.needs_stopsale;
            let isOverbook = day.has_overbook;
            let stopsaleDetails = day.stopsale_details;
            
            // If room type selected, override table counts
            if (activeFilters.roomType !== "ALL") {
                const rt = day.room_types[activeFilters.roomType];
                if (rt) {
                    sold = rt.sold;
                    cap = rt.capacity;
                    occPct = rt.occupancy_pct;
                    isStopsaleApplied = rt.stopsale_applied;
                    isOverbook = rt.sold > rt.capacity;
                    isNeedsStopsale = isOverbook || rt.needs_stopsale || (occPct >= threshold);
                    stopsaleDetails = rt.stopsale_details;
                }
            } else {
                isNeedsStopsale = day.has_overbook || day.needs_stopsale || (occPct >= threshold);
            }
            
            // Set tr styling class
            if (isStopsaleApplied) {
                tr.className = "row-stopsale";
            } else if (isOverbook || isNeedsStopsale || occPct >= threshold) {
                tr.className = "row-danger";
            } else if (occPct >= 70.0 || (day.full_rooms && day.full_rooms.length > 0)) {
                tr.className = "row-warn";
            }
            
            const soldCapHtml = `${sold} / ${cap}`;
            
            // 4. Occupancy Badge
            let badgeClass = "badge-success";
            if (isOverbook || occPct >= threshold) badgeClass = "badge-danger";
            else if (occPct >= 70.0 || (day.full_rooms && day.full_rooms.length > 0)) badgeClass = "badge-warning";
            const occBadge = `<span class="badge ${badgeClass}">${occPct}%</span>`;
            
            // 5. Room Type Status badgification (mini display)
            let rtBadgesHtml = `<div class="room-type-badges">`;
            Object.keys(day.room_types).forEach(rt => {
                if (rt.includes("dahil")) return; // Skip virtual group categories
                const rtData = day.room_types[rt];
                if (rtData.sold > 0) {
                    let rtClass = "";
                    if (rtData.stopsale_applied) rtClass = "rt-stopsale";
                    else if (rtData.sold > rtData.capacity) rtClass = "rt-danger";
                    else if (rtData.sold === rtData.capacity || rtData.occupancy_pct >= threshold) rtClass = "rt-full";
                    
                    const isOb = rtData.sold > rtData.capacity ? " ⚠️" : "";
                    rtBadgesHtml += `<span class="rt-badge ${rtClass}" title="${rt}: ${rtData.sold}/${rtData.capacity}${isOb}">${rt} (${rtData.sold})${isOb}</span>`;
                }
            });
            rtBadgesHtml += `</div>`;
            
            // 6. Rule/Stopsale Status Badge
            let ruleHtml = "";
            if (isStopsaleApplied) {
                if (occPct < 80.0) {
                    ruleHtml = `<span class="badge badge-warning" title="${stopsaleDetails.join(', ')}"><i class="fa-solid fa-door-open"></i> Satışa Açılabilir</span>`;
                } else {
                    ruleHtml = `<span class="badge badge-purple" title="${stopsaleDetails.join(', ')}"><i class="fa-solid fa-ban"></i> Stopsale Aktif</span>`;
                }
            } else if (isOverbook) {
                const obDesc = day.overbooked_rooms ? day.overbooked_rooms.join(', ') : 'Aşırı Satış';
                ruleHtml = `<span class="badge badge-danger" title="${obDesc}"><i class="fa-solid fa-triangle-exclamation"></i> Overbook Uyarısı!</span>`;
            } else if (isNeedsStopsale || occPct >= threshold) {
                ruleHtml = `<span class="badge badge-danger" title="${stopsaleDetails.join(', ')}"><i class="fa-solid fa-triangle-exclamation"></i> Stopsale Gerekli (%${occPct})</span>`;
            } else if (day.full_rooms && day.full_rooms.length > 0) {
                const fullDesc = day.full_rooms.join(', ');
                ruleHtml = `<span class="badge badge-warning" title="${fullDesc}"><i class="fa-solid fa-bed"></i> Dolu Odalar</span>`;
            } else if (occPct >= 70.0) {
                ruleHtml = `<span class="badge badge-warning"><i class="fa-solid fa-fire"></i> Yoğun (%${occPct})</span>`;
            } else {
                ruleHtml = `<span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> Normal (%${occPct})</span>`;
            }
            
            // 7. Actions Button
            const actionsHtml = `<button class="btn btn-secondary btn-small btn-view-date" data-idx="${day.date}"><i class="fa-solid fa-magnifying-glass"></i> Detaylar</button>`;
            
            tr.innerHTML = `
                <td><b>${dateStr}</b></td>
                <td>${dayName}</td>
                <td>${soldCapHtml}</td>
                <td>${occBadge}</td>
                <td>${rtBadgesHtml}</td>
                <td>${ruleHtml}</td>
                <td>${actionsHtml}</td>
            `;
            
            // Attach event listener
            tr.querySelector(".btn-view-date").addEventListener("click", () => showDateDetails(day));
            
            elements.auditTableBody.appendChild(tr);
        });
    }

    // Helper: format YYYY-MM-DD to DD.MM.YYYY
    function formatTurkishDate(dateStr) {
        const parts = dateStr.split("-");
        return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }

    function getTurkishDayName(enDay) {
        const maps = {
            "Mon": "Pazartesi",
            "Tue": "Salı",
            "Wed": "Çarşamba",
            "Thu": "Perşembe",
            "Fri": "Cuma",
            "Sat": "Cumartesi",
            "Sun": "Pazar"
        };
        return maps[enDay] || enDay;
    }

    // Render Date Details Modal
    function showDateDetails(dayData) {
        openModal(elements.modalDateDetails);
        
        const threshold = appData?.summary?.threshold_pct || 90.0;
        
        // Header
        elements.detailDateTitle.textContent = formatTurkishDate(dayData.date) + " (" + getTurkishDayName(dayData.day_name) + ")";
        
        // Status Badge
        elements.detailDateBadge.className = "badge";
        if (dayData.stopsale_applied) {
            elements.detailDateBadge.classList.add("badge-purple");
            elements.detailDateBadge.innerHTML = `<i class="fa-solid fa-ban"></i> Stopsale Aktif`;
        } else if (dayData.has_overbook) {
            elements.detailDateBadge.classList.add("badge-danger");
            elements.detailDateBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Overbook Uyarısı!`;
        } else if (dayData.needs_stopsale || dayData.occupancy_pct >= threshold) {
            elements.detailDateBadge.classList.add("badge-danger");
            elements.detailDateBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Stopsale Gerekli (%${dayData.occupancy_pct})`;
        } else if (dayData.full_rooms && dayData.full_rooms.length > 0) {
            elements.detailDateBadge.classList.add("badge-warning");
            elements.detailDateBadge.innerHTML = `<i class="fa-solid fa-bed"></i> Oda Bazlı Dolu`;
        } else if (dayData.occupancy_pct >= 70.0) {
            elements.detailDateBadge.classList.add("badge-warning");
            elements.detailDateBadge.innerHTML = `<i class="fa-solid fa-fire"></i> Yoğun Doluluk`;
        } else {
            elements.detailDateBadge.classList.add("badge-success");
            elements.detailDateBadge.innerHTML = `<i class="fa-solid fa-circle-check"></i> Satış Açık`;
        }
        
        // Room type occupancy bars
        elements.detailOccupancyBars.innerHTML = "";
        let firstAlertRoomType = "ALL";
        
        Object.keys(dayData.room_types).forEach(rt => {
            if (rt.includes("dahil")) return; // Skip virtual group categories
            const rtData = dayData.room_types[rt];
            
            const barWrapper = document.createElement("div");
            barWrapper.className = "bar-wrapper";
            
            let statusClass = "normal";
            let alertTag = "";
            
            if (rtData.sold > rtData.capacity) {
                statusClass = "danger";
                const diff = rtData.sold - rtData.capacity;
                alertTag = `<span style="color:#f43f5e; font-weight:700; margin-left:6px;"><i class="fa-solid fa-triangle-exclamation"></i> OVERBOOK (+${diff} Oda)</span>`;
                if (firstAlertRoomType === "ALL") firstAlertRoomType = rt;
            } else if (rtData.stopsale_applied) {
                statusClass = "stopsale";
                alertTag = `<span class="badge badge-purple" style="margin-left:6px; font-size:10px;">Stopsale</span>`;
            } else if (rtData.sold === rtData.capacity) {
                statusClass = "danger";
                alertTag = `<span style="color:#fb7185; font-weight:600; margin-left:6px;">DOLU</span>`;
                if (firstAlertRoomType === "ALL") firstAlertRoomType = rt;
            } else if (rtData.occupancy_pct >= threshold) {
                statusClass = "danger";
                alertTag = `<span style="color:#f43f5e; font-weight:600; margin-left:6px;">%${rtData.occupancy_pct}</span>`;
                if (firstAlertRoomType === "ALL") firstAlertRoomType = rt;
            } else if (rtData.occupancy_pct >= 70.0) {
                statusClass = "warn";
            }
            
            barWrapper.innerHTML = `
                <div class="bar-info">
                    <span class="bar-name">${rt}</span>
                    <span class="bar-val">${rtData.sold}/${rtData.capacity} (%${rtData.occupancy_pct})${alertTag}</span>
                </div>
                <div class="bar-container">
                    <div class="bar-fill ${statusClass}" style="width: ${Math.min(rtData.occupancy_pct, 100)}%"></div>
                </div>
            `;
            elements.detailOccupancyBars.appendChild(barWrapper);
        });
        
        // Alert/Explanation box & quick actions
        elements.detailAlertBox.className = "detail-section alert-status-box";
        
        if (dayData.is_past) {
            elements.detailAlertBox.classList.add("alert-normal");
            elements.detailAlertBox.innerHTML = `
                <div class="alert-box-header"><i class="fa-solid fa-clock-rotate-left"></i> Geçmiş Tarih Kaydı</div>
                <div class="alert-box-desc">Bu tarih geçmişte kaldığı için stopsale kural denetimi ve stopsale planlama adımları devre dışı bırakılmıştır. Oda doluluk oranları bilgi amaçlı gösterilmektedir.</div>
            `;
        } else {
            let alertHeader = "";
            let alertDesc = "";
            let boxClass = "alert-normal";
            
            if (dayData.has_overbook && dayData.overbooked_rooms && dayData.overbooked_rooms.length > 0) {
                boxClass = "alert-danger";
                alertHeader = `<i class="fa-solid fa-triangle-exclamation"></i> ACİL: Aşırı Rezervasyon (Overbook) Tespit Edildi!`;
                alertDesc = `Bu tarihte aşağıdaki oda tip(ler)inde satılan oda sayısı fiziksel kapasiteyi aşmıştır:<br><div style="margin:8px 0; padding:8px 12px; background:rgba(244,63,94,0.15); border-left:3px solid var(--danger); border-radius:4px; font-weight:600;">${dayData.overbooked_rooms.join("<br>")}</div>Lütfen acilen ilgili oda tipine Stopsale uygulayınız veya fazla rezervasyonları farklı oda kategorisine aktarınız.`;
            } else if (dayData.stopsale_applied) {
                boxClass = "alert-stopsale";
                alertHeader = `<i class="fa-solid fa-ban"></i> Stopsale Engeli Uygulanmış`;
                alertDesc = `Bu tarihte sistemde aktif stopsale bulunmaktadır. Detaylar:<br><strong>${dayData.stopsale_details.join("<br>")}</strong>`;
            } else if (dayData.needs_stopsale || dayData.occupancy_pct >= threshold) {
                boxClass = "alert-danger";
                alertHeader = `<i class="fa-solid fa-triangle-exclamation"></i> Yüksek Doluluk - Stopsale Öneriliyor!`;
                alertDesc = `Otel genel doluluk oranı (%${dayData.occupancy_pct}) belirlenen eşik değerine (%${threshold}) ulaşmıştır. Stopsale çekilmesi önerilir.`;
            } else if ((dayData.full_rooms && dayData.full_rooms.length > 0) || (dayData.high_occ_rooms && dayData.high_occ_rooms.length > 0)) {
                boxClass = "alert-warning";
                alertHeader = `<i class="fa-solid fa-circle-exclamation"></i> Oda Tipi Bazlı Doluluk Uyarısı`;
                const roomAlerts = [...(dayData.full_rooms || []), ...(dayData.high_occ_rooms || [])];
                alertDesc = `Otel geneli doluluk (%${dayData.occupancy_pct}) müsait olmakla birlikte, aşağıdaki oda tipleri tam kapasiteye veya yüksek doluluğa ulaşmıştır:<br><div style="margin:8px 0; padding:6px 12px; background:rgba(245,158,11,0.15); border-left:3px solid var(--warning); border-radius:4px; font-weight:600;">${roomAlerts.join("<br>")}</div>İlgili oda tipleri için stopsale planlanması önerilir.`;
            } else {
                boxClass = "alert-normal";
                alertHeader = `<i class="fa-solid fa-circle-check"></i> Satış Durumu Sağlıklı`;
                alertDesc = `Tüm oda tiplerinde ve otel genelinde doluluklar normal seviyededir. Herhangi bir stopsale aksiyonu gerekmemektedir.`;
            }
            
            elements.detailAlertBox.classList.add(boxClass);
            
            // Add quick local stopsale planner form to the alert box
            let defaultRemark = dayData.has_overbook ? "Aşırı Doluluk - Acil Overbook Stopsale" : "Yoğun Doluluk - Stopsale Önerisi";
            let quickFormHtml = `
                <div class="alert-box-header">${alertHeader}</div>
                <div class="alert-box-desc">${alertDesc}</div>
                <div class="quick-ls-form-container">
                    <h4><i class="fa-solid fa-calendar-plus"></i> Hızlı Stopsale Planla</h4>
                    <div style="display:flex; gap:10px; margin-top:8px; flex-wrap:wrap;">
                        <select id="quick-ls-room-type" style="padding:4px 8px; font-size:12px; background:rgba(0,0,0,0.2); color:white; border:1px solid rgba(255,255,255,0.1); border-radius:4px;">
                            <option value="ALL">Tüm Oda Tipleri</option>
                            ${Object.keys(dayData.room_types).map(rt => `<option value="${rt}" ${rt === firstAlertRoomType ? 'selected' : ''}>${rt}</option>`).join("")}
                        </select>
                        <input type="text" id="quick-ls-remark" placeholder="Stopsale Gerekçesi" style="padding:4px 8px; font-size:12px; background:rgba(0,0,0,0.2); color:white; border:1px solid rgba(255,255,255,0.1); border-radius:4px; flex:1;" value="${defaultRemark}">
                        <button id="btn-quick-ls-save" class="btn btn-primary btn-small" style="padding:4px 12px; font-size:12px;"><i class="fa-solid fa-plus"></i> Planı Ekle</button>
                    </div>
                </div>
            `;
            elements.detailAlertBox.innerHTML = quickFormHtml;
            
            // Quick stopsale event listener
            document.getElementById("btn-quick-ls-save").addEventListener("click", function() {
                const rt = document.getElementById("quick-ls-room-type").value;
                const remark = document.getElementById("quick-ls-remark").value;
                
                const payload = {
                    begin_date: dayData.date,
                    end_date: dayData.date,
                    room_type: rt,
                    remark: remark
                };
                
                fetch("/api/local_stopsales", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        alert("Stopsale planı başarıyla eklendi.");
                        refreshAllData();
                        dayData.stopsale_applied = true;
                        dayData.stopsale_details.push(`Planlanan (${rt}): ${remark}`);
                        showDateDetails(dayData);
                    } else {
                        alert("Eklenirken hata oluştu: " + data.error);
                    }
                })
                .catch(err => console.error("Error creating quick stopsale:", err));
            });
        }
        
        // Guest List details
        elements.detailGuestTbody.innerHTML = `<tr><td colspan="9" class="text-center"><i class="fa-solid fa-spinner fa-spin"></i> SQL'den konaklama listesi sorgulanıyor...</td></tr>`;
        elements.detailGuestCount.textContent = "0 Oda";
        
        fetch(`/api/date_details?date=${dayData.date}`)
            .then(res => res.json())
            .then(guests => {
                elements.detailGuestCount.textContent = `${guests.length} Oda`;
                elements.detailGuestTbody.innerHTML = "";
                
                if (guests.length === 0) {
                    elements.detailGuestTbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">Bu tarihte konaklayan aktif rezervasyon bulunamadı.</td></tr>`;
                    return;
                }
                
                guests.forEach(g => {
                    const tr = document.createElement("tr");
                    tr.innerHTML = `
                        <td><strong>${g.room_no || '—'}</strong></td>
                        <td><b>${g.guest_name}</b></td>
                        <td><span class="badge badge-blue">${g.agency}</span></td>
                        <td>${g.room_type}</td>
                        <td>${g.room_type}</td>
                        <td>${g.adult} Yetişkin / ${g.child} Çocuk / ${g.baby} Bebek</td>
                        <td>${formatTurkishDate(g.checkin)} / ${formatTurkishDate(g.checkout)} (${g.nights} Gece)</td>
                        <td>${g.voucher || '—'}</td>
                        <td><small class="text-muted">${g.record_user}</small></td>
                    `;
                    elements.detailGuestTbody.appendChild(tr);
                });
            })
            .catch(err => {
                console.error("Error fetching guest list:", err);
                elements.detailGuestTbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger"><i class="fa-solid fa-triangle-exclamation"></i> SQL bağlantı hatası sebebiyle misafir listesi alınamadı.</td></tr>`;
            });
    }

    // Load Local planned stopsales
    function loadLocalStopsales() {
        elements.localStopsalesTbody.innerHTML = `<tr><td colspan="5" class="text-center"><i class="fa-solid fa-spinner fa-spin"></i> Yükleniyor...</td></tr>`;
        
        fetch("/api/local_stopsales")
            .then(res => res.json())
            .then(data => {
                localStopsales = data;
                elements.localStopsalesTbody.innerHTML = "";
                
                if (data.length === 0) {
                    elements.localStopsalesTbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Planlanmış local stopsale bulunmuyor.</td></tr>`;
                    return;
                }
                
                data.forEach(ls => {
                    const tr = document.createElement("tr");
                    tr.innerHTML = `
                        <td><strong>${ls.room_type}</strong></td>
                        <td>${formatTurkishDate(ls.begin_date)}</td>
                        <td>${formatTurkishDate(ls.end_date)}</td>
                        <td>${ls.remark}</td>
                        <td>
                            <button class="btn btn-secondary btn-small btn-delete-ls text-danger" data-id="${ls.id}">
                                <i class="fa-solid fa-trash-can"></i> Sil
                            </button>
                        </td>
                    `;
                    
                    tr.querySelector(".btn-delete-ls").addEventListener("click", function() {
                        const id = this.getAttribute("data-id");
                        if (confirm("Bu stopsale planını silmek istediğinize emin misiniz?")) {
                            deleteLocalStopsale(id);
                        }
                    });
                    
                    elements.localStopsalesTbody.appendChild(tr);
                });
            })
            .catch(err => console.error("Error loading local stopsales:", err));
    }

    function saveLocalStopsalePlan(e) {
        e.preventDefault();
        
        const payload = {
            begin_date: document.getElementById("ls-start-date").value,
            end_date: document.getElementById("ls-end-date").value,
            room_type: elements.lsRoomType.value,
            remark: document.getElementById("ls-remark").value
        };
        
        fetch("/api/local_stopsales", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                elements.formLocalStopsale.reset();
                alert("Stopsale planı eklendi.");
                loadLocalStopsales();
                refreshAllData();
            } else {
                alert("Plan eklenirken hata oluştu: " + data.error);
            }
        })
        .catch(err => console.error("Error saving local stopsale:", err));
    }

    function deleteLocalStopsale(id) {
        fetch(`/api/local_stopsales?id=${id}`, {
            method: "DELETE"
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                loadLocalStopsales();
                refreshAllData();
            } else {
                alert("Silinemedi: " + data.error);
            }
        })
        .catch(err => console.error("Error deleting local stopsale:", err));
    }

    // Export Audit Data to CSV file
    function exportAuditToCSV() {
        if (!appData || !appData.dates) return;
        
        let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // Add UTF-8 BOM
        csvContent += "Tarih,Gun,Toplam Satilan,Toplam Kapasite,Doluluk Orani,Oda Tipleri Durumlari,Kural/Stopsale Durumu,Stopsale Detaylari\r\n";
        
        appData.dates.forEach(d => {
            const turkishDate = formatTurkishDate(d.date);
            const dayName = getTurkishDayName(d.day_name);
            const sold = d.sold_total;
            const cap = d.capacity_total;
            const occ = `${d.occupancy_pct}%`;
            
            // Format room types details into string
            const rtDetails = Object.keys(d.room_types)
                .filter(rt => !rt.includes("dahil"))
                .map(rt => `${rt}:${d.room_types[rt].sold}/${d.room_types[rt].capacity}`)
                .join(" | ");
                
            let ruleStatus = "Normal";
            if (d.stopsale_applied) {
                ruleStatus = d.occupancy_pct < 80.0 ? "Satis Acilabilir" : "Stopsale Aktif";
            } else if (d.has_overbook) {
                ruleStatus = "Overbook Uyarisi";
            } else if (d.needs_stopsale) {
                ruleStatus = "Stopsale Gerekli";
            }
            
            const details = d.stopsale_details.join(" | ").replace(/"/g, '""');
            
            const row = `"${turkishDate}","${dayName}",${sold},${cap},"${occ}","${rtDetails}","${ruleStatus}","${details}"\r\n`;
            csvContent += row;
        });
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Stopsale_Denetim_Raporu_${activeFilters.startDate}_${activeFilters.endDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // Run initialization
    init();
});
