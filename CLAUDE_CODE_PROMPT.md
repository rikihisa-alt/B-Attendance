# B-Attendance Web版 構築指示書 (Claude Code用)

このドキュメントは、既存の単一HTMLファイル `b-attendance.html` を、
**Next.js 14 + Supabase + Vercel** によるマルチデバイス対応Webアプリへ
移植するための完全な指示書です。

---

## 0. プロジェクト基本情報

- **製品名**: B-Attendance / 勤怠管理システム
- **運営**: 株式会社Backlly（自社運用、〜30名規模）
- **目的**: 36協定・有給5日義務化に対応した、Vercelデプロイで月コストほぼゼロの社内勤怠システム
- **既存資産**: `b-attendance.html` （単一HTMLファイル / localStorage動作 / 全機能実装済み）

このHTMLが**仕様の正本**です。UI・ロジック・バリデーションは全てこれを基準にして移植してください。

---

## 1. 技術スタック（厳守事項）

### 採用するもの
- **Next.js 14 App Router** （Server Components 中心）
- **TypeScript strict mode**
- **Tailwind CSS v3** （v4 は使わない）
- **Supabase**（PostgreSQL + Auth）
- **bcrypt** （管理者パスワードのハッシュ化）
- **Vercel** デプロイ
- **lucide-react** （アイコン）
- **@vercel/og** （PDF出力用、必要なら別途puppeteerでも可）

### 禁止事項
- **Tailwind v4 禁止**（v3.4 を `package.json` で固定）
- **shadcn/ui 禁止**（依存少なめで自前実装）
- **AI的グラデーション・絵文字多用UI 禁止**（Linear/Vercel風のシンプルさを維持）
- **Pages Router 禁止**（App Routerで統一）
- **クライアント専用ライブラリ（zustand/recoil等）の安易な追加禁止**
  → React の useState / Server State (Supabase) で十分

### デザイン基準
既存 `b-attendance.html` のCSS変数・色・余白・タイポグラフィをそのまま踏襲：
- カラー: ネイビー(`#1f4ea8`) + シアン(`#4fb1c4`) アクセント
- フォント: Shippori Mincho（和文見出し）+ JetBrains Mono（英字ラベル）
- ロゴ: HTMLに埋め込まれているbase64の `B-Attendance` ロゴ画像を `public/logo-full.png`, `public/logo-mark.png` に書き出して使用

---

## 2. ディレクトリ構成

```
b-attendance/
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx                # ログイン画面（USER / ADMIN タブ）
│   ├── (user)/
│   │   ├── layout.tsx                  # ユーザー画面共通レイアウト（ヘッダー＋ナビ）
│   │   ├── home/page.tsx               # 打刻画面（4ボタン + LIFOキャンセル）
│   │   ├── history/page.tsx            # 勤怠履歴（月次カレンダー＋日別詳細）
│   │   ├── requests/page.tsx           # 修正申請（一覧＋新規＋取消）
│   │   ├── leaves/page.tsx             # 休暇申請（同上）
│   │   └── profile/page.tsx            # マイページ（折り畳み3カード）
│   ├── (admin)/
│   │   ├── layout.tsx
│   │   ├── dashboard/page.tsx          # ダッシュボード（アラート＋統計）
│   │   ├── employees/page.tsx          # 従業員管理
│   │   ├── attendance/page.tsx         # 全社勤怠閲覧
│   │   ├── corrections/page.tsx        # 修正申請承認
│   │   ├── leaves/page.tsx             # 休暇承認
│   │   ├── reports/page.tsx            # PDF/CSV出力
│   │   ├── audit/page.tsx              # 監査ログ
│   │   └── settings/page.tsx           # システム設定
│   ├── api/
│   │   ├── admin/
│   │   │   ├── login/route.ts          # 管理者ログイン（bcrypt検証）
│   │   │   └── reset-password/route.ts # 従業員PWリセット
│   │   ├── attendance/
│   │   │   ├── clock/route.ts          # 打刻
│   │   │   └── cancel/route.ts         # LIFOキャンセル
│   │   └── reports/
│   │       ├── attendance-pdf/route.ts # 出勤簿PDF
│   │       └── monthly-csv/route.ts    # CSV出力
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/                              # 自前のButton, Card, Modal等
│   ├── clock/                           # 打刻パネル
│   ├── timeline/                        # タイムライン表示
│   ├── calendar/                        # 月カレンダー
│   └── nav/                             # サイドナビ
├── lib/
│   ├── supabase/
│   │   ├── client.ts                   # ブラウザ用クライアント
│   │   ├── server.ts                   # Server Component / Route Handler 用
│   │   └── admin.ts                    # service_role キー版（管理者操作用）
│   ├── attendance.ts                   # 勤怠計算ロジック (calcMonthlyOvertime 等)
│   ├── leave.ts                        # 有給日数計算
│   ├── audit.ts                        # 監査ログ書き込みヘルパー
│   ├── auth.ts                         # 認証関連ヘルパー
│   └── format.ts                       # 日付・時刻フォーマット
├── types/
│   └── db.ts                           # Supabase型定義（生成）
├── public/
│   ├── logo-full.png
│   └── logo-mark.png
├── supabase/
│   └── schema.sql                      # 添付の supabase_schema.sql をコピー
├── b-attendance.html                   # 仕様参照元（コミットしておく）
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.js
```

---

## 3. データモデル

`supabase_schema.sql` を **そのまま実行**してください。テーブル一覧：

| テーブル | 役割 |
|---|---|
| `settings` | システム設定（単一行） |
| `employees` | 従業員（**kana, birthday, first_login** 含む） |
| `attendance` | 勤怠記録（events: jsonb で打刻時系列。**admin_note 含む**） |
| `correction_requests` | 打刻修正申請（**withdrawn_at で本人取消対応**） |
| `leave_requests` | 休暇申請（type: paid/paid_am/paid_pm/sick/special/absence） |
| `audit_log` | 監査ログ（5年保存対応） |

### TypeScript型生成
```bash
npx supabase gen types typescript --project-id <YOUR_REF> > types/db.ts
```

---

## 4. 認証設計

### 一般ユーザー（Supabase Auth）
- メール形式: `EMP001@b-attendance.local`（社員ID @ 内部ドメイン）
- パスワード: 初期は管理者が設定 → 初回ログイン時に強制変更
- JWT app_metadata に `{ "role": "user", "emp_id": "EMP001" }` を必ず埋め込む
  → これにより RLS が機能する

### 管理者
- Supabase Auth は使わず、`settings.admin_password_hash` で直接認証
- ログイン成功時に **httpOnly cookie に独自JWT** を発行
  - JWT app_metadata: `{ "role": "admin" }`
- `/admin/*` ページは middleware でこのcookieを検証

### middleware.ts
```ts
// app/(admin)/* へのアクセスは admin cookie 必須
// app/(user)/*  へのアクセスは Supabase session 必須
// 未認証は /login へリダイレクト
```

---

## 5. 機能要件チェックリスト

`b-attendance.html` で実装済みの全機能を移植してください。
**漏れがあると本番運用で困ります。**

### 5.1 打刻機能（ユーザー）
- [ ] 出勤 / 休憩開始 / 休憩終了 / 退勤 の4ボタン
- [ ] **イベントログ式**: events配列に時系列で蓄積
- [ ] **LIFOキャンセル**: 直前60秒以内の打刻のみ取消可（`cancelled: true`で論理削除、履歴保持）
- [ ] 状態に応じてボタン有効/無効を切替
- [ ] タイムライン表示（取消は打ち消し線で表示）
- [ ] 楽観的UI更新 + Supabase反映

### 5.2 勤怠履歴（ユーザー）
- [ ] 月次カレンダー表示
- [ ] 土日は赤背景
- [ ] 日付クリックで詳細モーダル（events全件＋本人メモ）
- [ ] 月切替（前月/翌月）

### 5.3 修正申請（ユーザー）
- [ ] 過去日の打刻修正申請（理由必須）
- [ ] 申請一覧（pending / approved / rejected / withdrawn）
- [ ] **本人取消** （pending状態のみ、withdrawn_at記録）
- [ ] 申請が承認されたら attendance.events を上書き（modified_by/at記録）

### 5.4 休暇申請（ユーザー）
- [ ] 種別: 有給 / 午前半休 / 午後半休 / 病気 / 特別 / 欠勤
- [ ] 期間指定 (from_date, to_date) → 自動日数計算（半休は0.5日）
- [ ] 有給残チェック（`v_paid_leave_summary` ビュー活用）
- [ ] **本人取消**対応

### 5.5 マイページ（ユーザー）
- [ ] 統計カード（今月実働 / 今月残業 / 有給残 / 承認待ち件数）
- [ ] **3つの折り畳みカード**（デフォルト全部閉じてる）:
  - **基本情報**（閲覧のみ）: 社員ID / 氏名 / よみかな / 生年月日 / 所属 / 役職 / 登録日 / 最終PW変更
  - **氏名・よみかな・生年月日の変更**: 本人が編集可
  - **パスワード変更**: 現PW + 新PW×2、4文字以上、現PWと異なる必須
- [ ] **所属・役職・社員ID・有給日数は本人編集不可**（管理者のみ）
- [ ] 1項目1行のレイアウト（左:ラベル180px / 右:値）

### 5.6 ヘッダー
- [ ] ロゴ44px + 「B-Attendance」テキスト
- [ ] **ロゴ・タイトルクリック で打刻画面（管理者の場合はダッシュボード）へ遷移**
- [ ] リアルタイム時計表示
- [ ] ユーザーアバター + 名前 + ロール表示
- [ ] ログアウトボタン

### 5.7 初回ログインフロー
- [ ] `first_login=true` ならログイン直後に強制PW変更モーダル
- [ ] 初期PWと同じNGエラー
- [ ] 4文字以上、確認一致

### 5.8 ダッシュボード（管理者）
- [ ] アラート一覧（重要度ソート、ワンクリック対応ボタン）:
  - **緊急赤**: 未退勤打刻漏れ（直近7日）/ 36協定上限超過
  - **注意黄**: 休憩終了打刻漏れ / 残業警告ライン超過（80%）
  - **情報灰**: 初回ログイン未完了の従業員
- [ ] 統計カード（在籍数 / 今月の総残業 / 有給取得義務未達者数）

### 5.9 従業員管理（管理者）
- [ ] 一覧（在籍/退職フィルタ、初回未ログインバッジ）
- [ ] 新規登録: 在籍状態は強制active、firstLogin=true、役職任意
- [ ] 編集: 在籍状態セレクト・**PWリセットボックス**表示
- [ ] **PWリセット**: 新PWセット → first_login=trueに戻す → pw_reset_at記録
- [ ] よみかな・生年月日も編集可

### 5.10 全社勤怠閲覧（管理者）
- [ ] 従業員×日付のマトリクス表示
- [ ] 日付クリックで該当日の詳細モーダル
- [ ] **管理者専用備考** 編集（黄色枠、本人非表示）
- [ ] 「📝管理者メモあり」バッジ表示

### 5.11 修正・休暇承認（管理者）
- [ ] pending一覧、承認/却下/コメント
- [ ] 承認時に attendance テーブルへ反映
- [ ] 却下時は理由必須

### 5.12 PDF/CSV出力（管理者）
**CSV 3種**:
- [ ] サマリーCSV（1日1行集計）
- [ ] 全打刻ログCSV（全イベント時系列）
- [ ] 残業集計CSV（36協定チェック用）

**PDF 2種**:
- [ ] 出勤簿PDF（1人1ページ、土日赤背景、承認者欄＋押印枠）
- [ ] 月次サマリーPDF（全従業員一覧＋36協定状態）

実装方針: Server Component で HTML生成 → puppeteer-core (@sparticuz/chromium) でPDF化、
または既存HTMLの `window.print()` 方式を踏襲する場合は別ウィンドウで印刷ダイアログ起動。

### 5.13 設定（管理者）
- [ ] 会社名 / 所定労働時間・日数 / 始業終業時刻
- [ ] 36協定 月/年上限・警告ライン
- [ ] **管理者パスワード変更**

### 5.14 監査ログ
- [ ] 全テーブルの create / update / delete を `audit_log` に記録
- [ ] 期間・従業員・種別フィルタ
- [ ] CSV出力

---

## 6. 計算ロジック（lib/attendance.ts）

`b-attendance.html` の以下の関数を **挙動そのままに** TypeScript化：

```typescript
// 月次残業集計（36協定チェック用）
calcMonthlyOvertime(empId: string, monthStr: string): {
  overtime: number;      // 月の残業時間（分）
  totalWorked: number;   // 月の総実働（分）
  workDays: number;
  lateNight: number;     // 深夜労働（分）
}

// 年次残業集計
calcYearlyOvertime(empId: string, year: number): { overtime: number; ... }

// 1日の実働時間計算
calcDayWorked(events: AttendanceEvent[]): number  // 分

// LIFOキャンセル
cancelLastEvent(events: AttendanceEvent[], windowSec: number = 60): AttendanceEvent[]

// 有効イベント抽出
liveEvents(events: AttendanceEvent[]): AttendanceEvent[]
```

`b-attendance.html` の同名関数の中身を **そのまま参照**してください。
特に LIFO キャンセル・events 配列の扱いは挙動が複雑なので、HTML側のテストケースで動作確認すること。

---

## 7. 画面ごとの注意点

### ログイン画面
- USER / ADMIN タブ切替
- ロゴはヘッダーバー（`.login-header-bar` / padding 8px 32px）
- ロゴ高さ80px、横並びで「ロゴ｜勤怠管理システム｜時計」
- DEMO アカウント表示は本番ではフラグで非表示

### マイページ
- 折り畳みカードはデフォルト全閉じ
- ヘッダークリックで開閉、`.collapsed` クラスでCSS制御
- 1項目1行、グリッド `180px 1fr`

### 全社勤怠閲覧
- 大きめのテーブル → 横スクロール対応
- `admin_note` は黄色枠で表示、編集はモーダル内

---

## 8. 開発手順（推奨順序）

1. **`pnpm create next-app@14` で雛形作成**（TS + Tailwind + App Router 選択）
2. `package.json` で Tailwind を v3.4系に固定、`pnpm add @supabase/supabase-js bcryptjs lucide-react`
3. `supabase/schema.sql` を Supabase プロジェクトに流し込み
4. `npx supabase gen types typescript` で型生成
5. `lib/supabase/{client,server,admin}.ts` を整備
6. `b-attendance.html` をリポジトリにコミット（仕様書として）
7. ログイン画面 → ユーザーレイアウト → 打刻画面の順で実装
8. 勤怠履歴 → 修正・休暇申請 → マイページ
9. 管理者画面（ダッシュボード → 従業員管理 → 承認画面 → 設定 → レポート）
10. 監査ログ
11. PDF/CSV出力
12. middleware で認証ガード
13. Vercel にデプロイ、Supabase の Site URL に Vercel ドメイン追加

---

## 9. 移行データ取込

既存のlocalStorageデータを移行する場合：

1. ブラウザで `b-attendance.html` を開き、DevTools コンソールで:
   ```js
   copy(localStorage.getItem('b-attendance-data-v7'))
   ```
2. JSON ファイル化して `migration/data.json` に保存
3. 管理画面に「データインポート」ボタンを設置（service_role 経由で投入）

注意: `attendance` の `events` の `time` は ISO8601 文字列のまま保存可能。

---

## 10. 環境変数

`.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # 管理者操作・監査ログ書き込み用
ADMIN_JWT_SECRET=                  # 管理者cookie署名用 (openssl rand -hex 32)
```

Vercel に同じ変数を設定すること。

---

## 11. 完成判定

以下が満たされれば本番投入可能：

- [ ] EMP001 でログイン → 打刻 → 履歴に反映される
- [ ] 修正申請 → 管理者承認 → attendance に反映される
- [ ] 有給申請 → 管理者承認 → 残日数が減る
- [ ] 36協定アラートが残業ライン超過時に表示される
- [ ] PDF出力 / CSV出力が正常に動作
- [ ] マイページで氏名・よみかな・生年月日・PWを変更できる
- [ ] 所属・役職をユーザー画面から変更できない（管理者のみ）
- [ ] ヘッダーロゴクリックで打刻/ダッシュボードへ遷移
- [ ] 監査ログに全変更が記録される
- [ ] 別ブラウザでログイン → リアルタイム同期される（Supabase Realtime 任意）

---

## 12. よくある落とし穴

- **events配列の順序**: time フィールドで sort してから扱う。挿入順を信用しない
- **半休の日数計算**: paid_am/paid_pm は 0.5日。toDate-fromDate+1 に係数掛ける
- **タイムゾーン**: Supabase は UTC、表示は Asia/Tokyo。`Intl.DateTimeFormat` で `timeZone: 'Asia/Tokyo'` 必須
- **bcrypt**: Edge Runtime で動かないので Node Runtime 指定 (`export const runtime = 'nodejs'`)
- **service_role キー**: クライアントに絶対漏らさない。Server Component / Route Handler のみ
- **RLS**: 管理者操作で `auth.uid()` を使うとハマる。常に `supabaseAdmin` (service_role) で実行

---

これで全機能の移植が可能です。
不明点は `b-attendance.html` を grep して該当関数を確認してください。
