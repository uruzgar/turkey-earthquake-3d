import json
import os
from datetime import datetime
import requests

# Türkiye coğrafi sınırları ve tarih aralığı (Son 50 yıl: 1976 - 2026)
# Büyüklük filtresi performans ve anlamlı veri için 3.0 ve üzeri tutulmuştur.
USGS_API_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query"

params = {
    "format": "geojson",
    "starttime": "1976-01-01",
    "endtime": datetime.utcnow().strftime("%Y-%m-%d"),
    "minmagnitude": "3.0",
    "minlatitude": "35.0",
    "maxlatitude": "43.0",
    "minlongitude": "25.0",
    "maxlongitude": "45.0",
}


def fetch_historical_earthquakes():
  print("USGS API üzerinden son 50 yıla ait deprem verileri indiriliyor...")
  response = requests.get(USGS_API_URL, params=params)

  if response.status_code != 200:
    print(f"Hata: API'ye ulaşılamadı. Kod: {response.status_code}")
    return

  data = response.json()
  features = data.get("features", [])
  print(f"Toplam {len(features)} adet deprem verisi alındı. İşleniyor...")

  earthquakes = []
  for idx, item in enumerate(features):
    props = item["properties"]
    geom = item["geometry"]

    # USGS coordinates: [longitude, latitude, depth]
    lng, lat, depth = geom["coordinates"]

    # Zaman damgasını okunabilir formata çevir (Milisaniye -> UTC Datetime)
    time_ms = props["time"]
    date_str = datetime.utcfromtimestamp(time_ms / 1000.0).strftime(
        "%Y-%m-%d %H:%M:%S"
    )

    earthquakes.append({
        "id": f"eq_{idx}_{int(time_ms)}",
        "date": date_str,
        "lat": round(lat, 4),
        "lng": round(lng, 4),
        "depth": round(depth, 2),  # Derinlik (km) - Z ekseni için kritik!
        "magnitude": round(props["mag"], 2) if props["mag"] else 0.0,
        "location": props["place"]
        or "Türkiye ve Çevresi",  # Lokasyon açıklaması
    })

  # data klasörünü kontrol et, yoksa oluştur
  os.makedirs("../data", exist_ok=True)
  output_path = "../data/earthquakes.json"

  with open(output_path, "w", encoding="utf-8") as f:
    json.dump(earthquakes, f, ensure_ascii=False, indent=2)

  print(f"Başarılı! Veriler {output_path} dosyasına kaydedildi.")


if __name__ == "__main__":
  fetch_historical_earthquakes()