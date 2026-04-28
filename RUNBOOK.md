# B-Attendance 運用移行 RUNBOOK

## 概要

このドキュメントは、B-Attendance（勤怠管理システム）を**localStorage動作の単一HTMLファイル**から、**Supabase + Vercel + Next.js のWebアプリ**として本番運用に切り替えるための実行手順書です。

- **対象規模**: 株式会社Backlly 30名前後
- **想定コスト**: 月¥0〜¥200（Supabase Free + Vercel Hobby）
- **想定構築期間**: 5営業日（実装はClaude Code併用）
- **必要スキル**: Next.js / Supabase の基礎、ターミナル操作

---

## 0日目: 事前準備（半日）

### アカウント準備
| サービス | URL | 用途 |
|---|---|---|
| GitHub | github.com | コード管理 |
| Vercel | vercel.com | フロントエンドホスティング |
| Supabase | supabase.com | DB + Auth |

### ローカル環境
```bash
# Node.js 20+ 推奨
node -v   # v20以上

# pnpm インストール
npm install -g pnpm

# Supabase CLI（型生成・ローカル開発用、任意）
npm install -g supabase
```

### 既存データのバックアップ
本番運用に切り替える前に、現行の `b-attendance.html` のデータを必ずエクスポート：

1. 既存HTMLをブラウザで開く
2. 管理者ログイン
3. 設定画面の「データエクスポート」ボタン（または DevTools コンソールで）：
   ```js
   const data = localStorage.getItem('b-attendance-data-v7');
   const blob = new Blob([data], { type: 'application/json' });
   const a = document.createElement('a');
   a.href = URL.createObjectURL(blob);
   a.download = `b-attendance-backup-${new Date().toISOString().slice(0,10)}.json`;
   a.click();
   ```
4. ファイルを安全な場所に保管（Google Drive等）

---

## 1日目: Supabaseプロジェクト構築

### 1-1. プロジェクト作成
1. supabase.com → New Project
2. 設定：
   - Name: `b-attendance`
   - Database Password: 強固なものを生成して保管（後で使う）
   - **Region: `Northeast Asia (Tokyo)` 必須**（レイテンシ＋データ主権）
   - Pricing Plan: **Free** （30名なら十分）

### 1-2. スキーマ流し込み
1. プロジェクト画面 → SQL Editor
2. New query
3. `supabase_schema.sql` の内容を全部コピー＆ペースト
4. Run

成功すると以下のテーブルができる：
- `settings` （初期管理者PW=`admin` のbcryptハッシュ入り）
- `employees`
- `attendance`
- `correction_requests`
- `leave_requests`
- `audit_log`
- ビュー: `v_paid_leave_summary`

### 1-3. Auth設定
Authentication → Providers:
- **Email** を有効化
- Confirm email: **無効**（社内利用のため）
- Site URL: 後でVercelデプロイ後に追加（一旦空でOK）

### 1-4. APIキー控える
Project Settings → API：
- `Project URL` （`https://xxxxx.supabase.co`）
- `anon` `public` key
- `service_role` `secret` key ← **絶対公開禁止**

これらは1日目の終わりに使うので保管しとく。

---

## 2日目: Next.jsプロジェクト雛形

### 2-1. プロジェクト作成
```bash
pnpm create next-app@14 b-attendance
cd b-attendance
```

選択：
- TypeScript: Yes
- ESLint: Yes
- Tailwind CSS: Yes
- `src/` directory: No
- App Router: **Yes**
- Turbopack: お好み
- import alias: `@/*`

### 2-2. 依存追加
```bash
pnpm add @supabase/supabase-js @supabase/ssr bcryptjs lucide-react jose
pnpm add -D @types/bcryptjs

# Tailwind を v3に固定（v4 は仕様変更が大きいため）
pnpm remove tailwindcss
pnpm add -D tailwindcss@3.4.17 postcss autoprefixer
```

### 2-3. 環境変数
プロジェクトルートに `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
ADMIN_JWT_SECRET=                       # ←下のコマンドで生成
```

`ADMIN_JWT_SECRET` 生成：
```bash
openssl rand -hex 32
```

### 2-4. GitHubリポジトリ作成・push
```bash
git init
git add .
git commit -m "initial setup"
gh repo create b-attendance --private --source=. --push
```

### 2-5. Vercel連携
1. vercel.com → Add New → Project
2. GitHubリポジトリを選択
3. Environment Variables に `.env.local` の中身を全部入れる
4. Deploy

→ デプロイ完了したらドメインをコピー（例: `b-attendance.vercel.app`）

### 2-6. Supabase に Vercel ドメイン登録
Supabase → Authentication → URL Configuration:
- Site URL: `https://b-attendance.vercel.app`
- Redirect URLs に同URL追加

### 2-7. 既存HTMLをコミット
仕様書として `b-attendance.html` をリポジトリ直下にコミットしとく：
```bash
cp /path/to/b-attendance.html .
git add b-attendance.html
git commit -m "include reference HTML as spec"
git push
```

---

## 3日目〜4日目: Claude Code でフロント実装

### 3-1. Claude Code 起動
プロジェクトルートで：
```bash
cd b-attendance
claude
```

### 3-2. 初期プロンプト投入
Claude Code に対して：

```
このリポジトリは b-attendance.html を Supabase + Next.js 14 に
移植する作業をしている。CLAUDE_CODE_PROMPT.md を熟読してから、
以下の順で進めてほしい：

1. lib/supabase/{client,server,admin}.ts を作成
2. types/db.ts を Supabase から生成
3. app/(auth)/login/page.tsx を b-attendance.html のログイン画面の通りに作成
4. middleware.ts で認証ガード
5. ユーザー画面: home → history → requests → leaves → profile の順
6. 管理者画面: dashboard → employees → attendance → corrections → leaves → reports → audit → settings

各機能を作るたびに git commit してください。
HTMLの該当箇所を必ず参照し、UIとロジックは既存挙動と100%同一にしてください。
```

### 3-3. 進捗確認ポイント
1日の終わりに以下を確認：

| Day | 完成しておきたい範囲 |
|---|---|
| Day 3 | ログイン / 打刻 / 勤怠履歴 / マイページ |
| Day 4 | 修正申請 / 休暇申請 / 管理者ダッシュボード / 従業員管理 / 全社勤怠 |
| Day 5 | 承認画面 / 設定 / 監査ログ / PDF・CSV / 移行データ取込 |

### 3-4. よくあるトラブル

#### bcryptがEdge Runtimeで動かない
管理者ログイン用 Route Handler の先頭に：
```ts
export const runtime = 'nodejs';
```

#### RLSで弾かれる
管理者操作なのに `auth.uid()` で見てる時に発生。
**全ての管理者操作は `supabaseAdmin` (service_role) で実行**するように統一。

#### タイムゾーンずれ
Supabase は UTC、表示は Asia/Tokyo。`lib/format.ts` で：
```ts
new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
```
を徹底。

---

## 5日目: 本番移行

### 5-1. 既存データ取込
1. 管理画面の「データインポート」を開く（実装してもらう）
2. 0日目に保存した JSON を選択 → アップロード
3. サーバー側で `service_role` キー使って各テーブルへINSERT

実装イメージ（`app/api/admin/import/route.ts`）：
```ts
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  const data = await req.json();

  // employees
  for (const emp of data.employees) {
    await supabaseAdmin.from('employees').upsert({
      id: emp.id,
      name: emp.name,
      kana: emp.kana,
      birthday: emp.birthday,
      // ...
    });
  }

  // attendance
  const records = Object.entries(data.attendance).map(([key, val]) => {
    const [emp_id, date] = key.match(/^(.+)-(\d{4}-\d{2}-\d{2})$/).slice(1);
    return { emp_id, date, events: val.events, note: val.note, ...};
  });
  await supabaseAdmin.from('attendance').upsert(records);

  // ... requests, leaves
}
```

### 5-2. ユーザー作成（Supabase Auth）
従業員それぞれに Auth ユーザー作成（`app/api/admin/create-auth-user/route.ts`）：

```ts
const { data, error } = await supabaseAdmin.auth.admin.createUser({
  email: `${empId}@b-attendance.local`,
  password: initialPassword,  // 平文（本人が初回ログインで変更）
  email_confirm: true,
  app_metadata: { role: 'user', emp_id: empId }
});

// employees.auth_user_id を更新
await supabaseAdmin.from('employees')
  .update({ auth_user_id: data.user.id, first_login: true })
  .eq('id', empId);
```

### 5-3. 検証チェックリスト
本番投入前に必ず確認：

- [ ] EMP001 で打刻 → DB に記録されている
- [ ] 別ブラウザで EMP001 でログイン → 同じデータが見える
- [ ] 管理者ログイン → 全従業員が見える
- [ ] EMP001 が EMP002 のデータを見られない（RLS確認）
- [ ] 修正申請 → 承認 → attendance反映
- [ ] 休暇申請 → 承認 → 有給残減算
- [ ] 36協定アラートが残業オーバー時に表示
- [ ] PDF/CSV出力ができる
- [ ] 監査ログに全操作が記録される
- [ ] 初回ログインフローが動く
- [ ] PWリセットが動く

### 5-4. 従業員への展開
1. 全員に通知メール（社内Slack/メール）：
   ```
   勤怠システムが新しくなりました。
   
   URL: https://b-attendance.vercel.app
   社員ID: EMP001 （個別）
   初期パスワード: temp1234 （初回ログイン時に変更してください）
   
   不明点は [担当] まで。
   ```
2. 旧HTMLは1ヶ月ほど読み取り専用で残しておく（移行漏れ確認用）
3. 1ヶ月運用したら旧HTMLは凍結

---

## 運用フェーズ

### コスト試算（月額）

| 項目 | プラン | 規模 | 想定 |
|---|---|---|---|
| Supabase | Free | DB 500MB / 月50,000 MAU / 1GB ストレージ | 30名なら無料枠で余裕 |
| Vercel | Hobby | 100GB帯域 / 100GB-h関数 | 個人利用なら無料 |
| 独自ドメイン | お名前.com等 | 任意 | 約¥100〜300/月 |
| **合計** | | | **¥0〜¥300/月** |

注意点：
- Supabase Free は **1週間アクティビティなしで一時停止** する → 平日アクセスがあれば問題なし
- 容量不足のリスクは attendance.events のJSONBサイズ次第。30名×3年で約100MB想定
- Vercel Hobby は商用利用NG。**社内ツール扱いなら問題ないが、明確化のため Pro プランへの切替検討**（$20/月）

### バックアップ運用

#### 自動バックアップ（推奨）
Supabase の Free プランは7日分の自動バックアップあり。これに加えて：

#### 手動バックアップ（任意）
GitHub Actions で日次CSVエクスポート：

```yaml
# .github/workflows/backup.yml
name: Daily Backup
on:
  schedule:
    - cron: '0 19 * * *'  # 毎日04:00 JST
jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          curl -X POST https://b-attendance.vercel.app/api/admin/backup \
            -H "Authorization: Bearer ${{ secrets.BACKUP_TOKEN }}" \
            -o backup-$(date +%Y%m%d).json
      - uses: actions/upload-artifact@v4
        with:
          name: db-backup
          path: backup-*.json
          retention-days: 90
```

### 5年保存対応（労基法）

労働基準法では勤怠記録の5年保存が義務（経過措置で当面3年）。対応：

1. **attendance テーブルは絶対に削除しない**
   - 退職者も `employees.status = 'inactive'` で論理削除のみ
2. **audit_log で全変更履歴を保持**
3. 年1回、CSV/PDFで紙orクラウド保管：
   - 全従業員の年間出勤簿PDF
   - 監査ログCSV

### セキュリティ

- [ ] Supabase の `service_role` キーはVercel環境変数のみで管理。GitHubに絶対出さない
- [ ] 初期管理者PW `admin` は本番投入直後に**必ず変更**
- [ ] 管理者JWT secret も定期ローテーション（年1回）
- [ ] Vercel Authentication（Pro機能、$20/月）を導入すると社内IPのみ許可も可能
- [ ] RLS が機能してることを定期確認（別ユーザーでログインして他人データ見えないか）

### 監査ログ運用

- 月次レビュー（管理画面 → 監査ログ → 当月分エクスポート）
- 異常検知すべきパターン：
  - 同一ユーザーが短時間に大量の打刻修正
  - 退職者アカウントからの操作
  - 深夜帯の管理者操作

---

## トラブルシュート

### 「打刻ボタンが反応しない」
1. Supabase ダッシュボード → Logs を確認
2. RLS で弾かれてる場合: JWT app_metadata に emp_id が入ってるか確認
3. ネットワークタブで API レスポンス確認

### 「データが消えた」
1. Supabase の自動バックアップから復旧（Database → Backups）
2. または手動バックアップから

### 「Vercel が落ちる」
- 関数実行時間制限超過の場合は処理を分割
- 帯域超過の場合は Pro プランへ

### 「Supabase が一時停止された」
Free プランは7日無アクセスで停止 → ダッシュボードから手動再開

---

## 関連ドキュメント

- `b-attendance.html` … 仕様書（全機能の参照源）
- `supabase_schema.sql` … DB設計
- `CLAUDE_CODE_PROMPT.md` … 移植実装の指示書
- `RUNBOOK.md` … この文書

---

## 連絡先

不明点・障害発生時：[担当者連絡先]
