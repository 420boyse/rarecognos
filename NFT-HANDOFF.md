# RareCognos V2 — teslim ve çalıştırma

10 Kasım 2026. Kaynak: RareCognos-Final-2026-11-10.zip. Marka, onaylı SVG logoları, Nocturne hero/fade ve Studio görselleri korunur. Uygulanan kapsam, kullanıcının RareCognos-Codex-Revizyon-Promptu.md talebidir.

## Yayın durumu

Yerel geliştirme ve iki hesaplı zincir testleri tamamlandı. Bu paket canlı testnet kabulü veya denetlenmiş üretim marketplace'i değildir. LiteForge adresleri boş, verified=false olarak bırakıldı. Gerçek kullanıcı cüzdanı ile testnet dağıtımı ve iki cüzdan kabul testi henüz yapılmadı.

Mevcut Sites kimliği .openai/hosting.json içinde korundu. Sites get_site ve kaynak deposu erişimi, mevcut project_id için 404 döndürdü. Bu yüzden uzak kaynak karşılaştırması ve aynı siteye yayın gerçekleştirilemedi; yeni proje oluşturulmadı. Mevcut yayın adresi https://rarecognos-marketplace.efe793462.chatgpt.site/ bu revizyonu içerdiği iddiasıyla sunulmaz.

## Uygulananlar

- Tek ortak Wagmi/React Query cüzdan durumu; injected ve proje ID verilirse WalletConnect QR/mobil connector. Yanlış ağda işlemler kapalı; adres, Disconnect ve My NFTs üst barda.
- Aktif satış, yükleniyor, hata ve boş durum ayrımı. Hero Explore gerçek boş durumda Studio'ya gider. Ziyaretçi cüzdansız okuyabilir.
- Kullanıcının PNG/JPEG/WebP görseli, başlık, açıklama ve hak beyanı ile Create. İmzalı upload servisi dosyayı decode edip WebP'ye dönüştürür; 5 MB ve 25 megapiksel sınırı, metadata temizleme, origin kontrolü, 5 dakikalık tek kullanımlık nonce, içerik özeti ve kotalar bulunur.
- V2 ERC-721 mint(string uri): immutable ipfs URI başına en fazla bir token. Creator zincirde saklanır ve transferle değişmez. Aynı görselin başka metadata ile basılmasını veya telif ihlalini otomatik önlemez; 1/1 tanımı metadata URI içindir.
- Token/detail adresi #token/ID; metadata, creator, owner, fiyat, ağ, explorer; ayrı token/genel izin gösterimi ve ayrı kaldırma onayları. Satın almadan hemen önce fiyat, sahiplik, izin, transfer sürümü yeniden kontrol edilir. Gas tahmini toplamla gösterilir; kesin ücret değildir.
- Simülasyon, tek işlem kilidi, başarılı makbuz sonrası başarı. Zincir/cüzdan/kontrat/işlem hash'i localStorage'da tutulur. Yenileme sonrası makbuz ve nonce üzerinden replacement aranır; farklı işlem/cancel başarı sayılmaz. Yeniden kontrol butonu işlem göndermez. Arama son 2.000 blokla sınırlıdır; çözülemeyen işlem elle kontrol gerektirir. localStorage silinirse geçmiş kaybolur.
- Explore ve My NFTs 12'lik sayfalar; toplu HTTP okumaları; sürekli tüm geçmiş taraması yok. Metadata başına zaman/boyut sınırı ve kontrollü hata; IPFS/HTTPS dışında bağlantılar üretimde reddedilir.

## Yerel çalıştırma

Upload service artık Node 20+ ile çalışır (better-sqlite3). Node 22 zorunluluğu kaldırıldı. Frontend ve TypeScript test araçlarının mevcut Node gereksinimleri bundan bağımsızdır; tam proje için Node 22.16 önerisi korunur.

SQLite tablo yapısı ve WAL modu değişmedi. Node ana sürümü veya işletim sistemi değiştiğinde native better-sqlite3 modülü için hedef ortamda `npm ci` çalıştırın. Docker Node 22 tabanında kalır.

```sh
npm ci
npm run nft:test
npm run nft:dev
```

Uygulama http://127.0.0.1:8086/, geçici Ganache RPC http://127.0.0.1:8545/ (31337), yerel upload/IPFS gateway http://127.0.0.1:8787/. Yerel otomatik test hesapları gerçek kullanıcı cüzdanı değildir, private key dosyaya yazılmaz. Zincir kapanınca token ve ilanlar kaybolur. Yerel dosyalar public IPFS'e pinlenmez; UI bunu açıkça belirtir. Gerçek injected test cüzdanı için yerel ağa geçip sadece bu yerel RPC'de test bakiyesi vermek gerekir. Varsayılan npm run dev LiteForge modundadır; doğrulanmış adresler olmadan NFT işlemleri kapalıdır.

```sh
npm run typecheck
npm run test:upload
npm run test:transaction
npm run nft:test
npm run build
npm run build:site
```

Normal build TanStack Start/Nitro çıktısı; Sites build dist/client statik çıktısıdır. Upload backend iki build'den de ayrı bir servistir.

## Kalıcı upload servisini kurma

upload-service/server.mjs gerçek sunucu uygulamasıdır; statik Sites API anahtarını saklayamaz ve upload backend'i çalıştıramaz. Ayrı HTTPS Node sunucusu ve kalıcı disk gereklidir. Örnek Dockerfile sağlandı; Docker deploy denenmedi.

Sunucuda PINATA_JWT, UPLOAD_ALLOWED_ORIGINS (tam frontend origin, virgülle birden çok), UPLOAD_DATA_DIR (kalıcı disk), UPLOAD_HOST tanımlayın. npm run upload:serve çalıştırın. Dışarıya HTTPS reverse proxy arkasında sunun. Tek instance SQLite kullanır: yatay ölçekleme öncesi ortak veri tabanı/kota deposuna geçin. SQLite dosyası nonce, kota, hazırlanmış içerik kayıtlarını saklar; yedekleyin. IP kotası doğrudan socket adresini kullanır; reverse proxy arkasında proxy ortak kotaya girer, istemci başlığı körlemesine güvenilir sayılmaz. Eski kota kayıtları için işletim/bakım planı gereklidir.

Frontend derlemesine VITE_UPLOAD_API_URL, VITE_IPFS_GATEWAY, VITE_PUBLIC_APP_URL ve VITE_WALLETCONNECT_PROJECT_ID verin; .env.example örnektir. PINATA_JWT hiçbir zaman VITE_ ile başlamaz, frontend'e girmez. Gerçek anahtarların yalnızca placeholder olarak bırakılması istendiğinden canlı pinleme ve saklama sürekliliği doğrulanmadı. Servis başarısız pinlemeyi başarı olarak göstermeyecek şekilde hazırlanmıştır; tekrar denemede yeni nonce gerekir. EOA imzaları desteklenir; ERC-1271 smart-wallet upload imzaları bu sürümde desteklenmez.

## Production ortamı ve Docker — 10 Kasım güncellemesi

Kök `.env.example` yalnızca public frontend örneklerini içerir. Gerçek değerleri burada veya ZIP'te saklamayın. Frontend hosting ayarlarına `VITE_UPLOAD_API_URL`, `VITE_IPFS_GATEWAY`, `VITE_WALLETCONNECT_PROJECT_ID`, `VITE_PUBLIC_APP_URL` girin ve yeniden build alın. WalletConnect proje ID'si Pinata API key/secret değildir; ayrı WalletConnect/Reown projenizden alınır. Boş veya sadece boşluk olan ID connector'ı açmaz. Doluysa QR modal etkinleşir; metadata URL ve ikon public frontend URL'sinden gelir. WalletConnect panelinde gerçek frontend origin'ini izin listesine ekleyin; gerçek mobil bağlantı ayrıca denenmelidir.

Upload sunucusunda `upload-service/.env.example` dosyasını `upload-service/.env` olarak kopyalayıp yalnızca sunucuda yeni Pinata JWT'sini doldurun. `UPLOAD_ALLOWED_ORIGINS` tam frontend origin olmalı: HTTPS, path veya sondaki `/` olmadan. Birden fazla origin virgülle ayrılır; boşluklar temizlenir. Production'da `UPLOAD_DEMO=false` kalmalı.

Proje kökünden:

```sh
docker build -f upload-service/Dockerfile -t rarecognos-upload:v2 .
docker volume create rarecognos-upload-data
docker run -d --name rarecognos-upload --restart unless-stopped \
  --env-file upload-service/.env \
  -p 127.0.0.1:8787:8787 \
  -v rarecognos-upload-data:/data \
  rarecognos-upload:v2
```

Host reverse proxy'sinde `https://upload.senindomain.com` adresini `127.0.0.1:8787` adresine yönlendirin. HTTPS sonlandırma, request boyut sınırı en az 8 MB ve upload süresine uygun timeout ayarlayın. Servis tek instance ve kalıcı volume kullanır. Aynı host reverse proxy nedeniyle IP kotası ortak olabilir; kullanıcı kotası ayrıca cüzdan başına uygulanır. Docker runtime testi bu ortamda yapılmadı.

```sh
curl -H 'Origin: https://senin-frontend-domainin.com' https://upload.senindomain.com/status
```

`enabled:true` konfigürasyonun varlığını gösterir; JWT geçerliliği veya kalıcı pinleme kanıtı değildir. Gerçek cüzdanla bir upload yapıp dönen JSON/görseli herkese açık gateway'den doğrulayın. Docker dışında Node kullanıyorsanız `.env` otomatik yüklenmez: `node --env-file=upload-service/.env upload-service/server.mjs` çalıştırın.

`.gitignore` gerçek `.env` varyantlarını dışlar; yalnızca `.env.example` takip edilir. `.dockerignore` build bağlamını package dosyaları ve upload koduyla sınırlar, `.env` dosyalarını dışlar. `PINATA_JWT` yalnızca upload runtime ortamında bulunmalıdır. Vite başlangıç kontrolü public `VITE_` anahtarında Pinata/JWT veya bilinen Pinata secret değerini saptarsa değerini loglamadan işlemi durdurur. Vite'nin standart secret ayrımı korunur; bu kontrol gelecekte koda elle yazılacak secret'lara karşı genel bir garanti değildir. Gerçek anahtarlar bu revizyonda kullanılmadı, dosyalara kaydedilmedi. Daha önce paylaşılan anahtarları iptal edip yeni, sadece gerekli pinleme yetkilerine sahip JWT üretin.

Kaynaklar: [Vite ortam değişkenleri](https://vite.dev/guide/env-and-mode), [Wagmi WalletConnect](https://wagmi.sh/react/api/connectors/walletConnect).

## V2 testnet dağıtımı ve eski tokenlar

1. Kalıcı upload servisini kurup bir dosyanın IPFS/HTTPS üzerinden cüzdansız okunabildiğini doğrulayın. WalletConnect proje ID/domain ayarlarını yapın.
2. npm run nft:compile. VITE_NFT_DEPLOY=true ile uygulamayı açın, kullanıcı test cüzdanını LiteForge'a bağlayın. Panel simülasyon ve tahmini maliyeti gösterir. Koleksiyon, ardından o koleksiyona bağlı market iki ayrı kullanıcı onayıyla kurulur. Dağıtım adımları ve bekleyen hash'ler cüzdana göre localStorage'da saklanır.
3. **Explorer doğrulaması zorunlu:** LiteForge Explorer’da her iki kontrat adresini açın → Contract → **Verify and Publish** (arayüzde Verify & publish adıyla da görünebilir). Standard JSON Input seçip `artifacts/compiler-input.json` yükleyin: Solidity 0.8.30, Shanghai, optimizer 200. Koleksiyon constructor argümansız; market constructor argümanı yeni koleksiyon adresidir. Proxy yok.
4. NFTDeploy panelinde iki işlem başarılı olduktan sonra üretilen deployment JSON'unu kopyalayın; proje kökündeki `config/liteforge.json` dosyasının tüm içeriğini bu JSON ile değiştirin (kod bloğu işaretlerini almayın). `chainId:4441`, `schemaVersion:2`, iki adres ve iki deployment hash'ini explorer ile karşılaştırın. Doğrulama tamamlanana kadar `verified:false` kalmalıdır. Gerçek doğrulama URL'lerini ekleyip yalnızca iki kontrat doğrulandıktan sonra verified:true yapın. VITE_NFT_DEPLOY kapalı yeniden derleyin. Yerel adresleri testnet config'e taşımayın.
5. Gerçek A cüzdanı upload/mint/list, B cüzdanı buy; başka ilanda cancel; yanlış ağ, reddetme, mobil QR/deeplink ve reload testlerini kullanıcı onaylarıyla yürütün.

V1'in sabit dört esere dayalı kontratı değiştirilemez; V2 yeni koleksiyon ve market gerektirir. Eski tokenlar otomatik migrate/burn edilmez, sahiplik korunur. Metadata okuyucu standart tokenURI ile çalışır; creator() olmayan eski tokenı Legacy olarak gösterebilir, fakat bu V2 marketi yalnızca yapılandırılmış tek koleksiyonu işler. Eski koleksiyon için ayrı salt okunur görünüm/dağıtım gerekir; yeni V2 adresine geçmek eski koleksiyonu ana listeden çıkarır. Eski örnek metadata fixtures/legacy-metadata içinde tutuldu, localhost JSON'ları public yayından kaldırıldı.

## Test kapsamı ve sınırlar

Kontrat senaryoları gerçek geçici Ganache üzerinde: A upload/mint/approve/list → B buy; bakiye ve sahiplik; ayrı cancel; yetkisiz cancel; yanlış ödeme; çift buy; iptal sonrası buy; izin kaldırma; sahiplik gidiş-dönüşü stale listing; creator korunması; aynı URI reddi; token/global/both izinler ve kaldırma sıraları; eski fiyat/ilan reddi; self-buy; yetersiz bakiye.

Upload testleri: imza, süre, replay, içerik değiştirme, origin, dosya tipi/boyutu, public JSON/görsel okuma, idempotent tekrar, nonce yarışında tek başarı, kota. İşlem helper testleri: yanlış ağ, kullanıcı reddi, account değişimi, revert, repricing/cancel/replacement ve reload recovery. Replacement testleri kontrollü mock'tur; gerçek mobil cüzdan hızlandırma/iptal kabul testi yerine geçmez.

Tarayıcıda yerel RPC'ye bağlı test provider ile gerçek A upload/mint/list ve B buy çalıştırıldı; detay linki reload/back/forward; 1440 px ve 390 px görünüm, yatay taşma/konsol kontrolü yapıldı. Bu provider gerçek MetaMask/WalletConnect uygulaması değildir. Tam bekleyen-mint/reddetme/yenileme tarayıcı senaryosu otomasyon locator timeout nedeniyle tamamlanamadı; başarı olarak sayılmadı. Helper testleri geçti. Genel npm test içinde eski Grok/PWA şablonunun 8 testi başarısızdır; aynı 8 hata orijinal ZIP üzerinde de yeniden üretildi. Ayrıntılı son durum test-results.txt dosyasındadır.

## Marketplace kararı ve kaynaklar (10 Kasım 2026)
İncelenen sürüm: thirdweb-dev/contracts **v3.15.0**, DirectListingsLogic + MarketplaceV3. Apache-2.0 lisansı. Solidity EVM kodu olduğundan LiteForge'da çalışması beklenir; canlı uyumluluk kanıtı olarak sunulmaz. Native token sentinel `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE`; ödemede `msg.value` kullanılır. Satıcı native transferi reddederse CurrencyTransferLib, IWETH.deposit + ERC-20 transfer fallback'ine gider. Bu nedenle alıcının önceden token wrap etmesi gerekmez ama sağlam bir WETH uyumlu native wrapper dağıtımı gerekir. LiteForge için doğrulanmış wrapper adresi elde edilmedi; sıfır/uydurma adres seçilmedi ve thirdweb bu V1'de kullanılmadı.

Alternatif RareCognosMarket tek immutable koleksiyona bağlıdır; native ödeme başarısızsa bütün satış revert olur. OpenZeppelin ERC721Enumerable 5.4.0 ve ReentrancyGuard kullanır. Token-specific izin, exact payment, sahibi/izin/transfer-version kontrolü, stale listing reddi, CEI + nonReentrant vardır. Harici güvenlik denetimi yapılmamıştır. Yeni liste önceki listeyi devre dışı bırakır. İptal token iznini kaldırmaz; UI ayrı Revoke sunar. V2, 12 kayıtlık sayfalar ve HTTP batch okumaları kullanır. Büyük hacim için indexer önerilir.

- Resmi ağ: https://docs.litvm.com/get-started-on-testnet/network-configuration
- EVM: https://docs.litvm.com/deploy-on-testnet/evm-differences
- Sürüm kaynağı/lisans: https://github.com/thirdweb-dev/contracts/tree/v3.15.0
- Listings: https://github.com/thirdweb-dev/contracts/blob/v3.15.0/contracts/prebuilts/marketplace/direct-listings/DirectListingsLogic.sol
- Native fallback: https://github.com/thirdweb-dev/contracts/blob/v3.15.0/contracts/lib/CurrencyTransferLib.sol
- Wagmi: https://wagmi.sh/react/getting-started

Resmi RPC: https://liteforge.rpc.caldera.xyz/http, explorer: https://liteforge.explorer.caldera.xyz, chain ID 4441, native zkLTC (18 decimals). Doküman Zeeve geçişi sürerken yayımlanmış Caldera adreslerini belirtir; erişilebilirlik garantisi değildir.


## Pilot önerisi

Testnet yayını sonrası 3–5 kişilik pilot: her katılımcı tek eser mint/list, başka cüzdan buy ve ayrı ilan cancel. Geri bildirim için adım, cihaz/cüzdan, beklenen/gerçek sonuç ve isteğe bağlı tx hash alanlı kısa bir form kullanın. Seed/private key istemeyin. Bu teslimde üçüncü kişilere mesaj veya otomatik telemetri gönderilmedi.

Ek resmi kaynaklar: https://wagmi.sh/react/api/connectors/walletConnect ve https://docs.pinata.cloud/api-reference/endpoint/ipfs/pin-file-to-ipfs .

## Production yapılandırma doğrulaması

Mevcut JWT ve gerçek `.env` dosyaları korunur. Hosting ortam değişkenleri:

```dotenv
VITE_UPLOAD_API_URL=https://upload-sunucu-adresi
VITE_IPFS_GATEWAY=https://ipfs.io/ipfs/
VITE_WALLETCONNECT_PROJECT_ID=BURAYA_PROJECT_ID
VITE_PUBLIC_APP_URL=https://frontend-domaini
```

WalletConnect Project ID cloud.walletconnect.com’dan alınır. Frontend origin’i Allowed Domains listesine eklenmelidir. ID boşken connector kapalı, doluyken QR modal açıktır. Public değişkenler değişince frontend yeniden derlenmelidir. PINATA_JWT yalnızca upload sunucusundadır; `VITE_` öneki kullanılmaz.

Servis mevcut dosyayı Node üzerinden yükleyerek başlatılır: `node --env-file=upload-service/.env upload-service/server.mjs`. Ortam zaten host tarafından yüklenmişse `node upload-service/server.mjs` yeterlidir. `curl http://localhost:8787/status` Origin başlığı olmadan sağlık kontrolü yapabilir; upload endpoint'lerinde origin doğrulaması korunur. `enabled:true` JWT'nin yapılandırıldığını gösterir, gerçek Pinata yüklemesinin başarılı olduğunu kanıtlamaz. Bu çalışma yerel doğrulamadır; HTTPS hosting yayını değildir.

Doğrulama: Node 20.19.0 ile `npm ci`, `npm run typecheck`, `npm run test:upload` geçti. Servis 8787'de mevcut JWT ile IPFS modunda başlatıldı; Origin'siz curl 200 ve `enabled:true, mode:ipfs` döndürdü. Origin'siz upload ve izin verilmeyen origin testleri 403 döndürür. Docker `.env` dosyasındaki `/data` yolu korunur; macOS yerel kontrolde dosyayı değiştirmeden `UPLOAD_HOST=127.0.0.1 UPLOAD_DATA_DIR=.upload-data node --env-file=upload-service/.env upload-service/server.mjs` kullanıldı. WalletConnect connector davranışı değişmedi.
