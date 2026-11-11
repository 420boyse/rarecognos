# RareCognos — Codex uygulama promptu

Ekteki RareCognos-Final-2026-11-10.zip dosyasını aç ve mevcut projenin üzerinde çalış. Hedefim LiteForge testnet üzerinde kullanıcının kendi dijital eserini NFT olarak üretebildiği, listeleyebildiği ve başka bir kullanıcının satın alabildiği küçük, çalışan bir NFT marketplace. Tasarım kararlarına önem veriyorum. Mevcut siyah-beyaz, premium ve sade marka dilini geliştirerek uygulamayı tamamla.

Bu talep uygulama ve doğrulama işidir. Kod değişikliklerini yap, anlamlı testleri çalıştır, masaüstü ve mobil akışları doğrula ve sonuçları göster. Rutin, geri alınabilir uygulama kararlarını kendin al. Dış servis hesabı veya anahtar gerektiğinde, bağımsız işleri tamamlayıp gerekli bilgiyi tek ve açık bir listede belirt.

## 1. Kaynak sürüm ve başlangıç

- ZIP'in kök klasörü RareCognos. Kaynak, 10 Kasım 2026 tarihinde yayımlanan son önizlemenin bd539aac0633ef75bbfea2ad84ab08302ef9ca4b commit'inden alınmıştır.
- Güncel önizleme https://rarecognos-marketplace.efe793462.chatgpt.site/
- Mevcut Sites kimliği .openai/hosting.json içindedir. Sites erişimin varsa bu projeyi ve mevcut erişim politikasını kullan. Uzaktaki kaynak sonradan ilerlemişse değişiklikleri önce karşılaştır ve birleştir.
- Teknoloji TanStack Start/Router, React, TypeScript, Vite, Tailwind, wagmi, viem ve Solidity/OpenZeppelin. Mevcut bileşenleri ve işlem yardımcılarını kullan.
- Kurulum npm ci. Genel çalışma npm run dev. Yerel zincirli demo npm run nft:dev. Denetimler npm run typecheck, npm run nft:test ve npm run build. Özel önizleme için npm run build:site kullanılıyor.
- Başlangıçta AGENTS.md, package.json, NFT-HANDOFF.md, contracts/RareCognos.sol, src/lib/nft, src/components/nft-market.tsx, src/components/market-header.tsx, src/components/nft-deploy.tsx ve src/routes/index.tsx dosyalarını incele. Arşivdeki AGENTS.md eski geliştirme ortamına ait varsayımlar içeriyor. Kullanıcının bu prompttaki talebini ve çalıştığın gerçek ortamı esas al.
- Önce mevcut test durumunu tespit et. Mevcut handoff belgesindeki eski durumları işin sonunda gerçek sonuçlarla güncelle.

## 2. Kabul edilmiş tasarım

RareCognos logosunu ve göz ikonunu mevcut SVG dosyalarından kullan. Tipografi, boşluklar ve siyah-beyaz yüzeyler tutarlı olsun. Kobalt küçük vurgu rengi olarak kalsın.

Üst barda logo solda, Explore ve üretim bağlantısı ortada, cüzdan sağ üstte. Mobilde cüzdana görünür ve kolay erişim sağla. Tek ortak cüzdan bağlantı durumu kullan.

Hero'da Nocturne görseli ve “An eye for the rare.” başlığı var. Görselin alt kenarında sayfa zeminine yumuşak kararma uygulanmış durumda. Bu geçişi ve başlık-görsel ilişkisini koru.

Available to collect ile Studio Collection arasında yinelenen ayraç kaldırıldı. Boş satış alanındaki metin ve buton, üst ve alt çizgi arasında eşit boşlukla ortalandı. Yeni durumlarda da bu hizalamayı koru.

Ana sayfanın ilk Explore çağrısı ziyaretçiyi esere ulaştırsın. Aktif listeleme varsa satış alanına, gerçekten boşsa Studio Collection'a yönlendir. Yükleniyor ve RPC hatası durumlarını gerçek boş durumdan ayır. Eser önizlemeleri ve satış ilanlarının durumları açıkça anlaşılmalı.

Amour'daki hareketli galeri ve Corentin Bernadou'daki prizma fikri ileride aktif NFT listelemelerinin vitrini için referans. İlk aşamada temel işlemleri ve mobil kullanılabilirliği tamamla. Referanslardaki gezinme ve hareket fikirlerini özgün RareCognos bileşenlerine uyarla.

## 3. İlk sürümün ürün kapsamı

Tek ağ LiteForge, tek RareCognos ERC-721 koleksiyonu ve zkLTC ile sabit fiyatlı satış kullan. İlk kullanıcı üretimi için varsayılan model 1/1 eser olsun. Bu bir uygulama tercihi ve teslim notlarında açıkça belirtilmeli.

Kullanıcı kendi görselini yükleyebilsin, eser adı ve açıklamasını girebilsin, önizleyebilsin ve kendi cüzdanına mint edebilsin. Oluşturan cüzdan ve metadata URI kontratta esere bağlansın. Eserin yaratıcı bilgisi transferlerden sonra da korunmalı.

Mevcut dört stüdyo eseri vitrin ve yerel test verisi olarak değerlidir. Kontratın mevcut art < 4 sınırını ve arayüzün works[index] bağımlılığını yeni kullanıcı eserlerini destekleyecek şekilde düzenle. Eski stüdyo tokenlarının gösterimi için gereken uyumluluğu sağla. Kurulu kontrat veya gerçek token verisi varsa sürüm geçişini açıkça planla. Yeni kontratın ABI, derlenmiş çıktılar ve deployment ayarları aynı sürüme ait olsun.

1/1 bilgisi kontratın üretim davranışıyla tutarlı olmalı. Metadata için değişmez bir URI modeli kullan. Aynı dosyanın yeniden yüklenmesini ve bir NFT'nin 1/1 olmasını ayrı kavramlar olarak ele al. Bir dosyanın yalnızca hash'ine bakarak küresel özgünlük veya telif doğrulaması iddiası oluşturma.

## 4. Görsel yükleme ve kalıcı metadata

PNG, JPEG ve WebP ile başla. Dosya türünü sunucuda içerikten doğrula, boyut sınırı uygula ve sınırı formda göster. Yükleme durumu, hata ve yeniden deneme anlaşılır olsun. Eser adı, açıklaması ve hak sahibi olduğunu belirten kullanıcı beyanı formda bulunsun.

Görsel ve metadata için kalıcı, dışarıdan erişilebilir depolama kur. IPFS pinleme veya uygun kalıcı HTTPS depolamasını mevcut altyapı ve düşük maliyet hedefiyle seç. Servis anahtarları sunucu ortam değişkenlerinde tutulmalı. Yükleme uç noktasına cüzdan imzasıyla doğrulama, süreli ve tek kullanımlık nonce, kullanıcı başına boyut/istek sınırı uygula.

Mevcut build:site çıktısı statik önizlemedir. Kalıcı dosya yükleme için çalışan sunucu uç noktası gerekir. Mevcut TanStack sunucu yapısını ve dağıtım hedefini değerlendir. Gerçek upload servisi, tarayıcı erişimi ve CORS birlikte çalışmalı. Eksik servis ayarlarını form üzerinde anlaşılır bir durumla göster.

Görsel ve metadata yüklemesi tamamlandıktan sonra cüzdan mint onayına geç. Reddedilen mint, yenileme veya tekrar denemede aynı hazırlanmış metadata kaydı üzerinden güvenli devam sağla. Token ancak başarılı zincir makbuzu ve doğru kontrattan gelen mint olayı doğrulanınca üretilmiş sayılmalı.

Mevcut public/metadata dosyalarında localhost adresleri var. Yayın verilerini kalıcı adrese taşı. Özel ChatGPT önizlemesi giriş gerektirdiğinden herkese açık NFT metadata kaynağı olarak kullanılamaz. Metadata ve görseller oturum açmadan erişilebilir olmalı.

## 5. İzin kaldırma hatasını düzelt

Doğrulanmış mevcut hata şu akışta oluşuyor. Kullanıcı setApprovalForAll(market, true) ile genel izin veriyor. Arayüz approved bilgisini genel izin veya token izni olarak birleştiriyor. Revoke permission ise yalnızca approve(zeroAddress, tokenId) çağırıyor. Sonuçta genel izin aktif kalıyor.

Token iznini ve tüm koleksiyon için verilmiş izni ayrı oku ve göster. Kullanıcıya kaldıracağı iznin kapsamını açıkla. Genel izin kaldırma işlemi aynı koleksiyondaki diğer tokenları da etkilediğinden düğme ve onay metni bunu belirtmeli. Hem genel hem token izni varsa kalan izin durumunu da doğru ele al. İzin kalktı mesajını zincirdeki etkin yetki gerçekten kaldırılınca göster.

Bu durum için anlamlı bir regresyon testi ekle. Tek token izni, genel izin ve ikisinin birlikte bulunduğu durumları kapsa. Eşzamanlı işlem veya reddedilen imza sonrasında gerçek zincir durumunu yeniden oku.

## 6. Satış ve NFT detay deneyimi

Her token için paylaşılabilir bir detay adresi oluştur. Büyük eser görseli, eser adı, açıklama, yaratıcı, güncel sahip, token ID, ağ, 1/1 bilgisi, satış durumu ve explorer bağlantısı göster.

Sahip için satışa çıkarma adımları fiyat girme, gerekli token izni ve ilan oluşturma şeklinde anlaşılır ilerlesin. Fiyat her NFT'nin kendi formuna ait olsun. Alıcı için fiyat, ödeme birimi, tahmini ağ ücreti ve toplam tutarı doğrulanabilir biçimde göster. Ağ ücretinin tahmin olduğunu belirt.

Bağlantısız ziyaretçi eseri inceleyebilsin. Satın alma veya mint niyetinde bağlantı gerektiğini ilgili işlem üzerinde göster. Bağlantı ve ağ değişiminden sonra kullanıcı kaldığı esere dönebilsin.

Satış öncesinde sahipliği, izni, ilan etkinliğini ve fiyatı güncel veriden doğrula. İşlem sürerken aynı eylemin yinelenmesini engelle. Başarılı satıştan sonra hem ilan hem iki tarafın sahiplik bilgisi yenilensin. Satıcının kendi ilanını satın alma girişimi uygun biçimde engellensin.

My NFTs içinde sahip olunan eserler, aktif ilanlar ve ilan iptali erişilebilir olsun. İlan iptali ile transfer izninin kaldırılması farklı işlemler olarak anlaşılır anlatılsın.

## 7. Cüzdan ve işlem sürekliliği

Mevcut injected cüzdan bağlantısını geliştir ve mobil tarayıcıdan QR/deep-link ile cüzdan uygulamasına bağlanma yolunu ekle. Uygun sağlayıcıyı güncel resmî dokümanıyla doğrula. Gereken proje kimliğini ortam ayarıyla yönet.

Bağlanıyor, bağlı, yanlış ağ, bağlantı reddedildi, cüzdan bulunamadı ve bağlantı kesildi durumlarını işle. Sağ üst menüde kısa adres, My NFTs ve Disconnect erişilebilir olsun.

Gönderilen işlemi chain ID, kontrat, cüzdan, işlem türü ve hash ile yerel olarak takip et. Yenilemeden sonra makbuzdan durumu doğrula. Bekleyen işlem yeniden gönderilmemeli. Hızlandırılan işlemin yeni hash'ini izle. İptal edilen veya başka işlemle değiştirilen gönderimi mint/satış başarısı olarak gösterme. Onaylanmış işlem sonrası RPC yenileme hatasını da işlem başarısızlığıyla karıştırma.

Cüzdan veya ağ işlem sırasında değiştiğinde eski hesabın sonuçları yeni hesabın işlemi gibi gösterilmemeli. İmza ve gas onayı kullanıcı cüzdanından alınmalı.

## 8. Veri okuma ve hata durumları

Mevcut arayüz her 12 saniyede bütün ilan geçmişini sıralı okuyor. Küçük pilot için sınırlı sayfalama, uygun toplu okumalar ve işlem sonrası ilgili sorguları yenileme uygula. İlk ekran bütün geçmişin taranmasını beklememeli.

Yükleniyor, boş sonuç, RPC erişim hatası, metadata yüklenemedi, geçersiz ilan ve satış tamamlandı durumlarını ayrı göster. Bir tokenın bozuk metadata'sı tüm galeriyi durdurmamalı. Kullanıcı dosyalarından gelen metin ve URL'leri güvenli biçimde işle.

## 9. Testnet yayını ve erişim

LiteForge ağ, RPC ve explorer bilgilerini güncel resmî dokümandan doğrula. Mevcut chain ID 4441 ve para birimi zkLTC. Ağ erişimini ayrıca kontrol et.

Metadata adresini kesinleştir, kontratları derle, dağıtım adımlarını simüle et ve imza öncesi kontratları, ağı, metadata adresini ve tahmini maliyeti görünür yap. Gerçek dağıtım imzalarını kullanıcı cüzdanına bırak. İlk kontrat dağıtıldıktan sonra ikinci adımda yenileme veya kesinti olursa kaydedilen işlem ve adres üzerinden devam edilebilsin.

Yalnızca doğrulanmış gerçek kontrat adreslerini config/liteforge.json içine yaz. Explorer doğrulamasını tamamla ve frontend ABI uyumunu kontrol et. Testnet erişimi veya dış servis ayarı eksikse yerelde çalışan sonucu teslim et ve engeli kesin olarak belirt.

Mevcut önizlemeyi aynı Sites projesinde güncelle. Kaynağı uzaktaki son sürümle eşleştirerek ilerle. Sites bağlantın yoksa erişilebilir yerel önizleme sun ve hangi yayın adımının beklediğini açıkça yaz. Kullanıcı arayüz revizyonlarını bağlantı üzerinden incelemek istiyor.

## 10. Tamamlanma kriterleri

- A hesabı kendi görselini yükler, bilgilerini girer ve NFT'yi mint eder. Görsel, metadata, yaratıcı ve sahip bilgisi tutarlıdır.
- A hesabı bir NFT'ye fiyat verir, gerekli izni verir ve ilan oluşturur.
- B hesabı ilanı satın alır. NFT sahipliği B'ye, satış bedeli A'ya geçer. İlan satıştan sonra aktif görünmez.
- Başka bir ilanda iptal, fiyat değişikliği, izin kaldırma ve sahiplik değişimi doğru işlenir. Eski ilan üzerinden satın alma reddedilir.
- Genel izin kaldırma hatası için regresyon testi geçer.
- Cüzdan reddi, yetersiz test bakiyesi, yanlış ağ, başarısız makbuz, işlem hızlandırma/iptal, sayfa yenileme ve hesap değişimi denenir.
- Eser detay bağlantısı doğrudan açılır ve yenilenir. Geri/ileri gezinme tutarlıdır.
- 390 px ve 1440 px görünümlerde taşma, kapalı düğmeler veya üst bar örtüşmesi bulunmaz. Klavye, odak yönetimi ve azaltılmış hareket tercihi çalışır.
- Dosya yükleme hataları ve kötü biçimli metadata kontrollü karşılanır.
- TypeScript, kontrat testleri, normal üretim build'i ve Sites önizleme build'i geçer. Üretilen sayfa tarayıcıda açılıp temel işlemler kontrol edilir.
- Yerel test ve gerçek testnet sonuçları teslimde açıkça ayrılır. Test edilmemiş akışlar test edilmiş gibi raporlanmaz.

## 11. Teslim

Önce çalışan uygulama ve güncel önizleme bağlantısını ver. Ardından tamamlanan özellikleri, doğrulanan testleri, bilinçli ürün kararlarını ve kullanıcıdan gereken dış servis bilgilerini kısa bir listede sun. Kaynak kodu ve güncel NFT-HANDOFF.md birlikte teslim et.

Başarı hedefimiz üç sanatçının eser üretebildiği ve on deneme kullanıcısının cüzdan bağlayıp NFT işlemlerini tamamlayabildiği küçük bir pilot. Her işlemin başarısı zincir kaydıyla doğrulanabilsin. Kullanıcıların hangi adımda takıldığını öğrenmek için pilotta basit bir geri bildirim kanalı ve ölçülebilir tamamlanma adımları öner.
