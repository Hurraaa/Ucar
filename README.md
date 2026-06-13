# 🚗 Ucar — Sonsuz Yol

Arabanın **arkasından** gören, perspektifli (pseudo-3D) sürüş oyunu. Şeritli yolu
takip et, trafiği geç, en uzağa git.

## Özellikler
- **Arkadan görünüm**: Üç boyutlu hissi veren segment tabanlı perspektifli yol.
- **3 şerit + virajlar + tepeler**: Yol akıcı şekilde kıvrılır, savrulmaya dikkat.
- **Trafik araçları**: Şeritlerde engeller; çarpmadan sür.
- **İnce işçilik**: Katmanlı dağlar, kar tepeleri, güneş parıltısı, bulutlar,
  gökyüzü gradyanı ve mesafe sisi.
- **Detaylı araçlar**: Hacimli gövde gölgelemesi, arka cam, parlayan fren stopları,
  tekerlek ve zemin gölgeleri.
- **Profesyonel butonlar**: Cam efektli HUD, gradyanlı/parlamalı menü butonları,
  basılınca tepki veren dokunmatik direksiyon ve pedallar.
- **Araba seçimi**, skor / en iyi skor (kayıtlı), hız göstergesi, duraklatma.

## Oynanış
| Hareket | Klavye | Dokunmatik |
|---|---|---|
| Şerit değiştir | ◀ ▶ veya A / D | Sol alttaki oklar |
| Gaz | ▲ / W | Yeşil GAZ |
| Fren | ▼ / S | Kırmızı FREN |
| Duraklat | P / ESC | Sağ üst buton |

## Çalıştırma
Tarayıcıda `index.html` dosyasını aç. Sunucu gerekmez.

```bash
# isteğe bağlı yerel sunucu
python3 -m http.server 8000
# http://localhost:8000
```
