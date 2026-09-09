# Stopsale Audit & Oda Doluluk Dashboard Uygulaması

Bu doküman, `stopsale` klasöründe geliştirilen ve canlı SQL Server (`SednaAdakoy`) verilerine doğrudan bağlı olarak çalışan **Stopsale Denetim & Oda Doluluk Dashboard** uygulamasının mimarisini, stopsale tetikleme kurallarını, veritabanı şemasını ve yönetim talimatlarını içermektedir.

---

## 🚀 Proje Özet Bilgileri

* **Çalışma Alanı Konumu:** `/home/society/Masaüstü/stopsale`
* **Arka Plan Sunucusu:** Python Flask tabanlı (`app.py`), port `8095`
* **Canlı Veritabanı:** `pyodbc` ile canlı SQL Server (`192.168.0.41/SednaAdakoy`) bağlantısı
* **Lokal Veritabanı:** SQLite tabanlı planlama veritabanı (`stopsale.db`)
* **Servis Yönetimi:** systemd user service (`stopsale.service`) üzerinden 7/24 çalışma
* **Tasarım Yapısı:** Modern cam morfolojisi (glassmorphic) karanlık tema, interaktif takvim ısı haritası, arama/filtreleme özellikleri, detaylı misafir listesi ve Excel/CSV indirme seçeneği.

---

## 📂 Dosya Yapısı ve Mimarisi

```text
/home/society/Masaüstü/stopsale/
├── app.py                  # Flask backend uygulaması ve SQL/SQLite sorguları
├── requirements.txt        # Bağımlılık paketleri (Flask, pyodbc, pandas, dotenv)
├── stopsale.db             # Lokal ayarlar ve planlanan stopsale veritabanı (SQLite)
├── .env                    # Veritabanı bağlantı cümlesi ve port ayarları
├── venv/                   # Python sanal çalışma ortamı (Virtual Environment)
├── templates/
│   └── index.html          # Dashboard arayüzü (HTML5 / FontAwesome / Google Fonts)
└── static/
    ├── css/
    │   └── style.css       # Tasarım sistemi, cam efekti, renk paleti ve sticky tablolar
    └── js/
        └── app.js          # Canlı takvim, filtreler, modal etkileşimleri ve CSV dışa aktarma
```

---

## 📊 Stopsale Tetikleme Kuralları ve Algoritması

Çalışanların hata yapmasını önlemek ve doluluk sınırlarını hassas denetlemek amacıyla uygulamadaki stopsale öneri mantığı 4 ana kurala göre çalışır. **Bir günün "Stopsale Gerekli" (Kırmızı) durumuna geçmesi için ilgili gündeki herhangi bir oda tipinin veya otel genelinin aşağıdaki kurallardan en az birini tetiklemesi gerekir:**

### 1. Overbook Kontrolü (Aşırı Rezervasyon)
* **Kural:** Satılan Oda Sayısı > Oda Tipi Kapasitesi
* **Açıklama:** Veritabanında oda tipinin fiziksel kapasitesinden daha fazla oda satıldığında tetiklenir.
* **Gerekçe Gösterimi:** `Öneri (ODA_TIPI): Overbook! (X/Y oda satıldı)`

### 2. Dolu Kontrolü (Tam Kapasite)
* **Kural:** Satılan Oda Sayısı == Oda Tipi Kapasitesi
* **Açıklama:** İlgili oda tipinde hiç boş oda kalmadığında tetiklenir.
* **Gerekçe Gösterimi:** `Öneri (ODA_TIPI): Dolu! (X/Y oda satıldı)`

### 3. Güvenlik Limiti (Buffer) Kontrolü
* **Kural:** Kalan Boş Oda Sayısı <= Güvenlik Limiti (Varsayılan: `2`)
* **Uygulama Şartı:** Oda Tipi Kapasitesi > Güvenlik Limiti
* **Açıklama:** Boş oda sayısı kritik sınıra ulaştığında stopsale yapılmasını önerir. 
* *Hata Önleme Güvencesi:* `CLUB SV` (kapasitesi 2) gibi çok küçük kapasiteli oda tiplerinin boşken veya 1 oda satılmışken yanlışlıkla stopsale durumuna düşmesini önlemek için, bu kural sadece oda kapasitesi güvenlik limitinden büyük olan tiplerde çalışır.
* **Gerekçe Gösterimi:** `Öneri (ODA_TIPI): Güvenlik Limiti! (Kalan Boş Oda: X, Limit: Y)`

### 4. Doluluk Yüzdesi Eşiği
* **Kural:** (Satılan / Kapasite * 100) >= Doluluk Eşik Yüzdesi (Varsayılan: `%90.0`)
* **Açıklama:** Otel genel doluluğu veya ilgili oda tipi doluluğu belirlenen yüzdesel eşiğe (%90) ulaştığında Stopsale önerilir/tetiklenir.
* **Gerekçe Gösterimi:** `Öneri: Yüksek Doluluk! (%X >= %90.0)`

---

## 🔧 Lokal SQLite Veritabanı Şeması (`stopsale.db`)

Uygulamanın ayarlarını ve sistem dışında planlanan lokal stopsale kayıtlarını saklamak için SQLite veritabanı kullanılır:

### 1. `settings` (Ayarlar Tablosu)
* `threshold_pct` (DEFAULT `90.0`): Stopsale önerisini tetikleyecek yüzde sınırı (%90.0).
* `buffer_rooms` (DEFAULT `2`): Kritik oda güvenlik sınırı.
* `default_year` (DEFAULT `2026`): Raporlanacak sezon yılı.

### 2. `local_stopsales` (Planlanan Stopsale Tablosu)
Sistemde manuel olarak veya arayüz üzerinden eklenen stopsale planlarını tutar:
* `id` (INTEGER PRIMARY KEY): Benzersiz kayıt no.
* `begin_date` (TEXT): Başlangıç Tarihi (YYYY-MM-DD).
* `end_date` (TEXT): Bitiş Tarihi (YYYY-MM-DD).
* `room_type` (TEXT): Oda Tipi Kodu (`ALL` veya spesifik tip).
* `remark` (TEXT): Stopsale Gerekçesi (örn. *Acente Stopsale*, *Özel Blokaj*).
* `is_active` (INTEGER): `1` (Aktif) veya `0` (Pasif).
* `created_at` (TEXT): Oluşturulma tarihi.

---

## 💻 Kullanıcı Arayüzü (UI) Özellikleri

1. **Sezon Isı Haritası (Takvim):** Seçilen oda tipi veya otel geneline göre doluluk seviyesini yeşilden kırmızıya değişen tonlarda gösterir.
2. **Sabit Başlıklı Rapor (Sticky Table):** Tablo listesinde aşağı kaydırma yapıldığında başlık alanları ve butonlar ekranın üstünde sabit kalır, veriler başlığın altına temiz bir şekilde maskelenerek akar.
3. **Detay Modalı:** Herhangi bir güne tıklandığında:
   * Oda tiplerinin doluluk durumları görsel grafik çubuklarıyla listelenir.
   * **Önerilen Aksiyonlar** ve gerekçeleri açık şekilde belirtilir (Örn: overbook uyarısı veya güvenlik limiti ihlalleri).
   * O tarihte konaklayan tüm misafir listesi (Oda No, Ad Soyad, Acente, Pansiyon, Giriş/Çıkış, Voucher, Kaydeden Kullanıcı) canlı SQL'den çekilerek listelenir.
4. **Hızlı Stopsale Planlama:** Detay modalının içinden doğrudan o gün için lokal stopsale kaydı oluşturulabilir.

---

## 🛠️ Çalıştırma ve Servis Yönetimi Talimatları

Uygulama arka planda systemd servisi olarak kesintisiz çalışmaktadır. Servisi yönetmek için aşağıdaki komutlar kullanılabilir:

* **Servis Durumunu Kontrol Etme:**
  ```bash
  systemctl --user status stopsale.service
  ```
* **Servisi Yeniden Başlatma (Kod değişikliklerinden sonra):**
  ```bash
  systemctl --user restart stopsale.service
  ```
* **Servisi Durdurma:**
  ```bash
  systemctl --user stop stopsale.service
  ```
* **Servisi Başlatma:**
  ```bash
  systemctl --user start stopsale.service
  ```
* **Canlı Logları İnceleme:**
  ```bash
  journalctl --user -u stopsale.service -f
  ```
