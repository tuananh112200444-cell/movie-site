# Tool Tao HLS va Upload Backblaze

Tool nay dung cho web phim:

1. Chon file MP4/MKV.
2. Nhap slug phim, vi du `cherm-chey`.
3. Nhap so tap, vi du `5`.
4. Tu tao HLS:
   - `master.m3u8`
   - `seg_00000.ts`
   - `seg_00001.ts`
5. Neu da cai rclone, tu upload len Backblaze B2 bucket `videomeu8`.
6. In ra link de dan vao add-movie:
   - `https://video.khophim.org/cherm-chey/tap-5/master.m3u8`

## Cai dat lan dau

### 1. Cai FFmpeg

Tai FFmpeg Windows:

```txt
https://www.gyan.dev/ffmpeg/builds/
```

Chon ban `release full`, giai nen, them thu muc `bin` vao PATH.

Kiem tra trong PowerShell:

```powershell
ffmpeg -version
```

### 2. Cai rclone de upload tu dong

Tai rclone:

```txt
https://rclone.org/downloads/
```

Them rclone vao PATH, kiem tra:

```powershell
rclone version
```

Sau do chay:

```txt
Cai-dat-rclone-Backblaze.bat
```

Trong rclone config:

- remote name: `b2`
- storage: Backblaze B2
- nhap keyID va applicationKey cua Backblaze tren may ban
- bucket dang dung: `videomeu8`

Khong gui Backblaze key cho ai trong chat.

## Cach dung moi ngay

Chay:

```txt
Tao-HLS-Upload.bat
```

Sau do:

1. Chon file phim.
2. Nhap slug phim.
3. Nhap so tap.
4. Doi tool convert/upload xong.
5. Copy link mau xanh dan vao add-movie.

## Chay khong upload

Neu chi muon convert, khong upload:

```powershell
.\Tao-HLS-Upload.ps1 -NoUpload
```

## Cau hinh

Sua file `config.json` neu can doi:

- bucket
- CDN origin
- rclone remote
- CRF/chat luong
- thu muc output

CRF goi y:

- `22`: dep hon, file lon hon
- `24`: can bang, nen dung mac dinh
- `26`: nhe hon, giam chat luong chut
- `28`: rat nhe, chat luong giam ro
