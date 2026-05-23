RAILWAY LICENSE SERVER ROOT PACKAGE

Deploy dung folder nay lam ROOT tren Railway.
Sau khi deploy thanh cong, test:
https://YOUR-APP.up.railway.app/health
https://YOUR-APP.up.railway.app/admin

Neu /admin hien 404:
- Ban dang deploy sai folder/repo
- Hoac Railway Root Directory khong tro toi folder chua server.js nay
- Can dat Root Directory = / neu upload rieng zip nay
- Start Command = node server.js
