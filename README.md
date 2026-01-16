# rss-notification-discordbot
RSS情報をDiscordサーバーのテキストチャンネルに通知するBOT

## 機能
* 1時間ごとにRSSフィードを取得して新着記事を通知
* lastFetchedDate以降の全ての新着記事を通知
* Embed形式で記事タイトル・リンク・公開日時を表示
* RSS 2.0, RSS 1.0 (RDF), Atomフォーマットに対応

## 動作環境
* Google Apps Script (GAS)
* Googleスプレッドシート

## セットアップ

### スクリプトプロパティの設定
1. GASスクリプトプロパティ
    - 以下のプロパティを追加:
        ・DISCORD_WEBHOOK_URL
        ・SPREADSHEET_ID

### トリガーの設定
1. GASエディタで「トリガー」→「トリガーを追加」
2. 実行する関数: `main`
3. イベントのソース: 時間主導型
4. 時間ベースのトリガーのタイプ: 時間ベースのタイマー
5. 間隔: 1時間ごと

### スプレッドシートの形式
| name | url | lastFetchedDate |
|------|-----|-----------------|
| Yahoo News Top Topics | https://news.yahoo.co.jp/rss/topics/top-picks.xml | 2026-01-16T19:53:36.836Z |

## 通知される情報
* 記事タイトル（リンク付き）
* 公開日時
* フィード名

## 備考
* GASの実行時間制限は6分です
* Discordのレート制限を考慮し、通知間に0.5秒の待機を入れています
* `lastFetchedDate`が空の場合、全ての記事が通知される可能性があります
  - 必要に応じて事前に日時を入力してください（ISO 8601形式）
