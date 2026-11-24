# めもっぷ

画像をマップとして登録し、気になる場所にピンを立ててメモやコメントを残せる Web アプリです。マップはフォルダに整理でき、公開マップを共有したり、あとで見たいマップを保存したりできます。

React、Vite、Supabase を使っています。ログインは GitHub、Google、またはメールで行います。

Supabase Auth にはログイン用メールの送信回数に上限があるため、できるだけ GitHub または Google アカウントでログインしてください。

## 開発の進め方

1. **気づいたことを Issue にする。** 使いにくいところや不具合を見つけたら、誰でも Issue を作れます。どの画面で何をしたときに起きたかを書いておくと、他の人も確認しやすくなります。
2. **取り組む Issue を選び、ブランチを作る。** どのメンバーも Issue を拾って作業できます。ブランチ名は `タスク名-名字` とし、必要に応じて末尾に番号を付けます。例として `admin-kaneda` や `admin-kaneda-1` が使えます。
3. **プルリクエストを Issue に紐づける。** すべてのプルリクエストの本文に、対応する Issue 番号を書きます。その変更で Issue の対応が完了する場合は、`Closes #123` のように記載します。
4. **Copilot の自動レビューを確認する。** プルリクエストを出したら、Copilot のレビュー結果を確認し、対応が必要な指摘を反映します。

## ローカルで起動する

Node.js 22 系（22.12 以上）を用意し、VS Code のコマンド プロンプトでリポジトリのルートから実行します。

```cmd
npm ci
copy .env.example .env.local
```

すでに `.env.local` がある場合は、既存のファイルを使ってください。チームで使う既存の Supabase プロジェクトの URL と publishable キーを設定します。

| 環境変数 | 設定する値 |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase のプロジェクト URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 同じプロジェクトの publishable キー |

`VITE_` 付きの値はブラウザから参照できるため、secret キーや `service_role` キーはここに設定しないでください。`.env.local` は Git の管理対象外です。

```cmd
npm run dev
```

ターミナルに表示されたローカル URL を開きます。ログイン後に元の画面へ戻れない場合は、Supabase Auth のリダイレクト許可リストにその URL が含まれているか確認してください。

## Supabase の接続先

チームの Supabase には、マップ・ピン・コメントなどのテーブルと、画像を保存する `map-images` バケットが用意されています。ローカル起動時は、そのプロジェクトに接続すれば使えます。開発中に投稿すると、接続先のデータベースに保存されます。

`Could not find the table 'public.folders' in the schema cache` が出たら、まず `VITE_SUPABASE_URL` が目的のプロジェクトを指しているかと、そのプロジェクトの Table Editor に `public.folders` があるかを確認してください。

## Google ログインの設定

Google アカウントでログインできるようにするには、Supabase と Google Cloud Console で設定が必要です。

### 1. Google Cloud Console での設定

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. プロジェクトを選択（または新規作成）
3. **APIs & Services** → **Credentials** に移動
4. **Create Credentials** → **OAuth client ID** を選択
5. Application type で **Web application** を選択
6. **Authorized JavaScript origins** に以下を追加：
   - `http://localhost:5173`（ローカル開発用）
   - 本番環境のURL（例：`https://your-app.vercel.app`）
7. **Authorized redirect URIs** に Supabase のコールバック URL を追加：
   - `https://[YOUR-PROJECT-REF].supabase.co/auth/v1/callback`
   - `[YOUR-PROJECT-REF]` は Supabase の Project URL から取得
8. 作成後、**Client ID** と **Client Secret** をコピー

### 2. Supabase での設定

1. Supabase の管理画面を開く
2. **Authentication** → **Providers** に移動
3. **Google** プロバイダを有効化
4. Google Cloud Console でコピーした **Client ID** と **Client Secret** を入力
5. **Save** をクリック

### 3. 動作確認

1. ローカル環境で `npm run dev` を実行
2. ブラウザで `http://localhost:5173` を開く
3. **Google ログイン** ボタンをクリック
4. Google アカウントでログインできることを確認

**注意**: Google Cloud Console で設定した Authorized redirect URIs にアクセス元の URL（ローカルまたは本番）が含まれていないと、ログインに失敗します。

## ビルドとチェック

| コマンド | 用途 |
| --- | --- |
| `npm run lint` | コードを静的チェックする |
| `npm run build` | 配布用ファイルを `dist/` に出力する |
| `npm run preview` | ビルドしたアプリをローカルで確認する |

Vercel でデプロイする場合も、接続先に合わせて上の2つの環境変数を設定します。ログインに使うデプロイ先の URL は Supabase Auth のリダイレクト許可リストに登録してください。
