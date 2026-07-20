// =========================================================
// 企業（協賛先）ごとの「閲覧数レポート」設定
//
// ⚠️⚠️ このリポジトリは GitHub で「公開」設定（誰でもソースを読めます）。
//        したがって【合言葉（トークン）は、このファイルに絶対に書かないこと】。
//        書いた瞬間、専用リンクが誰でも開ける状態になります。
//
// 合言葉の置き場所 ＝ Cloudflare 側の「シークレット」（外から見えない環境変数）。
//   管理用（依田が全ページ見る）: ADMIN_TOKEN
//   企業ごと                    : TOKEN_<下のキーを大文字にしたもの>
//     例) キーが "vitalize" なら → TOKEN_VITALIZE
//
// 設定コマンド（1社ぶん）:
//   npx wrangler pages secret put TOKEN_VITALIZE --project-name ekatsu-web
//
// このファイルに書くのは「どの会社に、どのページを見せるか」だけ。
// キー（"vitalize" など）は秘密ではないので、分かりやすい名前でよい。
//
//   entries = その企業に見せるページの一覧（path は計測キーと一致させる）
//     path の付け方: トップ="/"、お知らせ="/news/<slug>"、他="/works" など（.html なし）
//   label = 企業向けに表示する名前（社内向けの生slugではなく、伝わる名前にする）
// =========================================================
export const COMPANIES = {
  // ▼ 例（使うときはコメントを外し、Cloudflare 側に TOKEN_VITALIZE を登録する）
  // vitalize: {
  //   name: "株式会社Vitalize 小海支社",
  //   entries: [
  //     { path: "/sponsor-vitalize", label: "五箇いわな手作りだし醤油の素 紹介ページ" },
  //     { path: "/sponsors",         label: "共同スポンサー一覧" },
  //   ],
  // },
};

// 合言葉から会社を引き当てる。合言葉は env（Cloudflareのシークレット）にしか無い。
// 一致しなければ null（＝呼び出し側で404にする）。
export function findCompanyByToken(env, token) {
  if (!token) return null;
  for (const [id, company] of Object.entries(COMPANIES)) {
    const expected = env["TOKEN_" + id.toUpperCase()];
    if (expected && token === expected) return company;
  }
  return null;
}

// 管理用（全ページ表示）かどうか。ADMIN_TOKEN が未設定なら常に false ＝管理ビューは無効。
export function isAdminToken(env, token) {
  return Boolean(env.ADMIN_TOKEN) && token === env.ADMIN_TOKEN;
}
