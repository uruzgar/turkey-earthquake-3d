import json
import os
from datetime import datetime
import requests
from bs4 import BeautifulSoup

KOERI_URL = "http://www.koeri.boun.edu.tr/scripts/lst6.asp"
JSON_PATH = "../data/earthquakes.json"


def update_daily_earthquakes():
  print("Kandilli Rasathanesi son depremler kontrol ediliyor...")
  try:
    response = requests.get(KOERI_URL, timeout=10)
    response.encoding = "ISO-8859-9"  # Türkçe karakter desteği

    if response.status_code != 200:
      print("Kandilli sayfasına erişilemedi.")
      return

    soup = BeautifulSoup(response.text, "html.parser")
    pre_tag = soup.find("pre")

    if not pre_tag:
      print("Deprem verisi formatı bulunamadı.")
      return

    lines = pre_tag.text.strip().split("\n")[
        7:
    ]  # Başlık satırlarını atla

    # Mevcut JSON verisini yükle
    if os.path.exists(JSON_PATH):
      with open(JSON_PATH, "r", encoding="utf-8") as f:
        earthquakes = json.load(f)
    else:
      earthquakes = []

    existing_dates = {eq["date"] for eq in earthquakes}
    new_count = 0

    for line in lines:
      parts = line.split()
      if len(parts) < 10:
        continue

      date_str = f"{parts[0]} {parts[1]}"
      try:
        lat = float(parts[2])
        lng = float(parts[3])
        depth = float(parts[4])
        mag = float(parts[6])
        location = " ".join(parts[8:-1])

        if date_str not in existing_dates:
          earthquakes.append({
              "id": f"eq_daily_{int(datetime.utcnow().timestamp())}",
              "date": date_str,
              "lat": lat,
              "lng": lng,
              "depth": depth,
              "magnitude": mag,
              "location": location,
          })
          new_count += 1
      except ValueError:
        continue

    # Güncellenmiş listeyi kaydet
    with open(JSON_PATH, "w", encoding="utf-8") as f:
      json.dump(earthquakes, f, ensure_ascii=False, indent=2)

    print(
        f"Güncelleme tamamlandı. Sisteme {new_count} yeni deprem eklendi."
    )

  except Exception as e:
    print(f"Güncelleme sırasında hata oluştu: {e}")


if __name__ == "__main__":
  update_daily_earthquakes()