# Upload from an Apple Shortcut

Send photos and videos to Loft straight from the Photos share sheet, with no need to open the app.

## 1. Get your key

Loft → **Settings → Apple Shortcut → Make key**. Copy the **Key** and the **URL**. The key is shown only once. If you lose it, tap **New key** (the old one stops working).

Each person makes their own key. Pictures go into the library of the person whose key was used.

## 2. Build the Shortcut

In the Shortcuts app, make a new shortcut:

1. **Settings (ⓘ) → Show in Share Sheet**: on. Accepts: *Images* and *Media*.
2. **Repeat with Each** item in *Shortcut Input*
3. Inside the loop, add **Get Contents of URL**:
   - URL: the URL you copied (`https://loft-api.<you>.workers.dev/api/push`)
   - Method: **POST**
   - Headers: `Authorization` = `Bearer loft_…` (your key, after the word `Bearer` and a space)
   - Request Body: **Form**, with one field: name `file`, type **File**, value *Repeat Item*
4. (Optional) After the loop, add **Show Notification** "Sent to Loft".

Now in Photos: select pictures → Share → your Shortcut.

## What happens next

- The picture is saved right away.
- Until the app makes the real thumbnail, it shows a grey placeholder. The app does this the next time you open it (or within a minute if it's already open). The app also reads the date the photo was taken and files it under the right month.
- Photos are made on any device. HEIC photos need Safari (iPhone/Mac), and videos need a desktop browser.

## Optional: video dates

Videos carry no date the app can read. To file them under the right month, add a second form field `taken_at` set to the video's *Creation Date*, formatted as ISO 8601 (use **Format Date → ISO 8601**). If you leave it out, the video is filed under the day it was uploaded.

## Limits

- 100 MB per file (Cloudflare's free-tier limit).
- Photos and videos only.
