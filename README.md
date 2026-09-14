# e活 ウェブサイト

「e活（e-Katsu）」公式サイトのソースです。
**プレーンな HTML / CSS / JavaScript のみ**で作られているので、ビルド作業は不要です。
ファイルをそのまま編集 → そのまま公開できます。

---

## 📁 ファイル構成

```
ekatsu-web/
├─ index.html              ← ページ本体（文章・リンクはここを編集）
├─ assets/
│  ├─ css/styles.css       ← 見た目（色・余白・文字サイズ）
│  ├─ js/main.js           ← スクロール時のふわっと表示
│  └─ img/
│     ├─ logo.webp         ← e活 ロゴ（黒）
│     └─ hero.jpg          ← トップの山の写真
└─ README.md              ← このファイル
```

---

## ✏️ よくある編集

すべて `index.html` を開いて、該当箇所を書き換えるだけです。
各セクションには `<!-- ===== ○○ ===== -->` というコメントの目印があります。

| やりたいこと | 編集する場所 |
|---|---|
| 文章を直す | `index.html` の各セクション内のテキスト |
| お知らせを追加する | `<!-- ===== お知らせ ===== -->` の中の `<li>` をコピーして一番上に追加 |
| お問い合わせフォームを設定する | `index.html` 内の `https://forms.gle/XXXXXXXXXXXX` を実際の Google フォーム URL に置換 |
| Discord / Google フォームのリンクを変える | 各 `<a class="btn" href="...">` の href を変更 |
| 色・余白の調整 | `assets/css/styles.css` の先頭 `:root { ... }` の変数 |

> 💡 Claude Code に「お知らせに〇〇を追加して」「会社情報の担当名を変えて」のように
> 自然な日本語で頼めば、該当箇所を編集してくれます。

### お問い合わせフォームについて
このサイトは静的サイト（サーバーなし）のため、フォーム送信は **Google フォーム**に集約しています。
- 現在のフォーム: `https://forms.gle/kSByU9JLqwRWNXHo6`（回答は専用スプレッドシートに保存）
- フォームを差し替える場合は、`index.html` の「お問い合わせフォームを開く」ボタンの `href` を新しい共有 URL に変更してください。

---

## 📋 活動実績ページ（works.html）の自動生成

`works.html` の大会カードは、Googleの **「大会スケジュール_マスター」スプレッドシート**から自動生成します。手で編集せず、下記コマンドで再生成してください。

```bash
cd tools
npm install        # 初回のみ
node build-works.js
```

- **掲載対象**：マスターの「情報公開」列が **○** の大会のみ（×・空欄は載りません）
- **リンク**：配信URL（無ければ大会X）
- **画像**：「大会KV画像」列(M)にURLがあれば取得して表示、無ければ準備中サムネ
- **更新タイミング**：マスターを更新したら、このコマンドを1回実行すれば `works.html` に反映されます
- ⚠️ `works.html` の `WORKS:START 〜 WORKS:END` の間は自動生成領域です。手で編集しないでください（再生成で上書きされます）
- 認証は e活Bot の `.env`（Google認証情報）を流用します（既定パス: `../../e-katsu/.env`）

> 備考列（協賛依頼文・担当名・社内数値など）は内部情報のため、サイトには出力していません。

## 📣 サポーター掲載とXの紹介ポスト

VTuber・サポーターの掲載（`vtuber.html` / お知らせ記事）は GitHub Actions が
毎週 月曜・木曜の朝8時（JST）に自動で行います（`.github/workflows/build-vtuber.yml`）。

**Xの紹介ポストは自動では出しません。**（2026-09-14 依田の指示）

> 以前は記事ができると同時に `tools/supporter_news.json` に書き込まれ、Botがそれを拾って
> 自動で #x投稿 に下書きを入れていました。そのため 9/13 に作った記事が、ご本人からいただいた
> 紹介文の直しが反映される前の 9/14 19時にそのままポストされてしまいました。
> 同じことを起こさないため、人の確認を1つ挟む形にしています。

| ファイル | 役割 |
|---|---|
| `tools/supporter_news_pending.json` | **承認待ち**。記事を作るとここに入る。Botは読まない |
| `tools/supporter_news.json` | **Botが読む列**。ここに入った記事だけがXに出る |
| `tools/vtuber_published.json` | 初掲載の記録。`xPost` が `"approved"` の人だけXに出す |

### 出すまでの流れ

1. 自動更新が走る → サイト掲載とお知らせ記事ができる。Xの紹介は**承認待ちで止まる**
2. ご本人に紹介文（お名前・ひとこと・ゲームタイトル・Xのアカウント）をご確認いただく
3. 直しがあれば先にマスター／記事を直す
4. OKが出て、お約束した日時になったら承認する

```bash
cd tools
node approve-supporter-post.js                      # 承認待ちの一覧を見る
node approve-supporter-post.js supporter-2026-09-15 # 中身を出して、Botの列に入れる
node approve-supporter-post.js supporter-2026-09-15 --dry   # 中身を見るだけ
node approve-supporter-post.js supporter-2026-09-15 --drop  # この回はXに出さない
node approve-supporter-post.js supporter-2026-09-15 --at 2026-09-16  # 出す日を指定する（既定は今日）
```

承認したら `tools/supporter_news.json` と `tools/supporter_news_pending.json` を
コミット＆プッシュしてください（Botはリポジトリのファイルを見ています）。

### 出し直すとき

一度出したポストを取り消して出し直す場合は、`tools/supporter_news.json` の該当記事を
`tools/supporter_news_pending.json` に戻し、`tools/vtuber_published.json` のその人の `xPost` を
`"pending"` に戻してから、出す日に改めて承認してください。
（2026-09-14 の `supporter-2026-09-13` はこの手順で戻し、9/15(火) 19時に出し直します）

---

## 👀 ローカルで確認する

このフォルダを開いた状態で、ターミナルから簡易サーバーを起動できます。

```bash
# Node.js がある場合
npx serve .
```

または `index.html` をブラウザに直接ドラッグ＆ドロップしても表示できます。

---

## 🚀 公開する（Cloudflare Pages の例）

無料で SSL・CDN 込みで公開できます。

1. このフォルダを GitHub リポジトリにプッシュ
2. [Cloudflare Pages](https://pages.cloudflare.com/) で「Connect to Git」→ リポジトリを選択
3. ビルド設定は **不要**（フレームワークなし）
   - Build command: （空欄）
   - Build output directory: `/`（このフォルダ直下）
4. デプロイ完了。以降は GitHub に push するだけで自動更新されます。

> Netlify や GitHub Pages でも同様に、ビルド設定なしでそのまま公開できます。

---

## 🎨 素材について

- `assets/img/hero.jpg` … トップの山の写真（Unsplash）
- `assets/img/logo.webp` … e活 ロゴ

差し替える場合は同じファイル名で上書きするか、`index.html` / `styles.css` 内の
ファイル名を新しいものに変更してください。
