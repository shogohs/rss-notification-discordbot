/**
 * RSS通知Discord BOT for Google Apps Script
 * 
 * 設定方法:
 * 1. スクリプトプロパティに以下を設定
 *    - DISCORD_WEBHOOK_URL: DiscordのWebhook URL
 *    - SPREADSHEET_ID: フィード情報を管理するスプレッドシートのID
 * 2. トリガーを設定（1時間ごとに実行）
 */

// スクリプトプロパティから設定を取得
function getConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    webhookUrl: props.getProperty('DISCORD_WEBHOOK_URL'),
    spreadsheetId: props.getProperty('SPREADSHEET_ID')
  };
}

// メイン関数（トリガーから呼び出す）
function main() {
  const config = getConfig();
  
  if (!config.webhookUrl || !config.spreadsheetId) {
    console.error('設定が不足しています。スクリプトプロパティを確認してください。');
    return;
  }
  
  const feeds = loadFeeds(config.spreadsheetId);
  console.log(`フィード数: ${feeds.length}`);
  
  for (let i = 0; i < feeds.length; i++) {
    const feed = feeds[i];
    console.log(`\n[${i + 1}/${feeds.length}] ${feed.name} をチェック中...`);
    try {
      const newItems = fetchRSS(feed);
      console.log(`  新着記事: ${newItems.length}件`);
      
      if (newItems.length > 0) {
        // 古い順にソート
        newItems.sort((a, b) => new Date(a.pubDate) - new Date(b.pubDate));
        
        // 通知を送信
        for (const item of newItems) {
          console.log(`  → 通知: ${item.title}`);
          sendDiscordNotification(config.webhookUrl, item, feed.name);
          // レート制限対策のため少し待機
          Utilities.sleep(500);
        }
        
        // lastFetchedDateを更新
        updateLastFetchedDate(config.spreadsheetId, i + 2, new Date().toISOString());
      }
    } catch (error) {
      console.error(`Error fetching RSS for ${feed.name}: ${error}`);
    }
  }
}

// スプレッドシートからフィード情報を読み込み
function loadFeeds(spreadsheetId) {
  const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName('feeds');
  if (!sheet) {
    console.error('feedsシートが見つかりません');
    return [];
  }
  
  const data = sheet.getDataRange().getValues();
  const feeds = [];
  
  // ヘッダー行をスキップ（1行目）
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[0] && row[1]) { // nameとurlが存在する場合
      feeds.push({
        name: row[0],
        url: row[1],
        lastFetchedDate: row[2] ? new Date(row[2]) : new Date(0)
      });
    }
  }
  
  return feeds;
}

// lastFetchedDateを更新
function updateLastFetchedDate(spreadsheetId, rowIndex, dateString) {
  const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName('feeds');
  sheet.getRange(rowIndex, 3).setValue(dateString);
}

// RSSフィードを取得して新しい記事を返す
function fetchRSS(feed) {
  const response = UrlFetchApp.fetch(feed.url, {
    muteHttpExceptions: true
  });
  
  if (response.getResponseCode() !== 200) {
    throw new Error(`HTTP Error: ${response.getResponseCode()}`);
  }
  
  const xml = response.getContentText();
  const document = XmlService.parse(xml);
  const root = document.getRootElement();
  
  const newItems = [];
  const items = parseRSSItems(root);
  console.log(`  RSS記事総数: ${items.length}件`);
  
  for (const item of items) {
    const pubDate = new Date(item.pubDate);
    if (pubDate > feed.lastFetchedDate) {
      newItems.push(item);
    }
  }
  
  return newItems;
}

// RSSアイテムをパース（RSS 2.0とAtomに対応）
function parseRSSItems(root) {
  const items = [];
  const rootName = root.getName();
  
  if (rootName === 'rss') {
    // RSS 2.0
    const channel = root.getChild('channel');
    const itemElements = channel.getChildren('item');
    
    for (const item of itemElements) {
      items.push({
        title: getChildText(item, 'title'),
        link: getChildText(item, 'link'),
        pubDate: getChildText(item, 'pubDate') || getChildText(item, 'dc:date')
      });
    }
  } else if (rootName === 'feed') {
    // Atom
    const ns = root.getNamespace();
    const entryElements = root.getChildren('entry', ns);
    
    for (const entry of entryElements) {
      const linkElement = entry.getChild('link', ns);
      const link = linkElement ? linkElement.getAttribute('href').getValue() : '';
      
      items.push({
        title: getChildTextNS(entry, 'title', ns),
        link: link,
        pubDate: getChildTextNS(entry, 'published', ns) || getChildTextNS(entry, 'updated', ns)
      });
    }
  } else if (rootName === 'RDF') {
    // RSS 1.0 (RDF)
    const rssNs = XmlService.getNamespace('http://purl.org/rss/1.0/');
    const dcNs = XmlService.getNamespace('dc', 'http://purl.org/dc/elements/1.1/');
    const itemElements = root.getChildren('item', rssNs);
    
    for (const item of itemElements) {
      items.push({
        title: getChildTextNS(item, 'title', rssNs),
        link: getChildTextNS(item, 'link', rssNs),
        pubDate: getChildTextNS(item, 'date', dcNs)
      });
    }
  }
  
  return items;
}

// 子要素のテキストを取得
function getChildText(element, childName) {
  const child = element.getChild(childName);
  return child ? child.getText() : '';
}

// 名前空間付きで子要素のテキストを取得
function getChildTextNS(element, childName, namespace) {
  const child = element.getChild(childName, namespace);
  return child ? child.getText() : '';
}

// Discord Webhookで通知を送信
function sendDiscordNotification(webhookUrl, item, feedName) {
  const embed = {
    title: item.title ? item.title.substring(0, 256) : 'タイトルなし',
    url: item.link || undefined,
    color: 0x0099FF,
    footer: {
      text: feedName
    }
  };
  
  // タイムスタンプがある場合のみ設定
  if (item.pubDate) {
    embed.timestamp = new Date(item.pubDate).toISOString();
  }
  
  const payload = {
    embeds: [embed]
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(webhookUrl, options);
  
  if (response.getResponseCode() !== 204 && response.getResponseCode() !== 200) {
    console.error(`Discord API Error: ${response.getResponseCode()} - ${response.getContentText()}`);
  }
}
