const fs = require('fs');
const content = fs.readFileSync('src/i18n/te.json', 'utf8');
const fixed = content.replace(
  /(\"orgLoginNotice\": \"ఈ పేజీ కస్టమర్ సంస్థ rolesのためにのみ\. 新しいユーザーは承認されたメール招待リンクを通じて来ます\.\",)/,
  '$1\n  "invite": {\n    "title": "{org} を招待",\n    "success": "招待を送信しました!",\n    "successDesc": "ユーザーは招待を受け入れるためのメールを受け取ります。",\n    "cancel": "キャンセル",\n    "back": "戻る",\n    "lookup": "ユーザーを検索",\n    "sendInvite": "招待を送信",\n    "emailPlaceholder": "user@company.in",\n    "namePlaceholder": "フルネーム",\n    "fieldEmail": "メール",\n    "fieldName": "名前",\n    "fieldRole": "組織での役割",\n    "existingUser": "既存ユーザーが見つかりました: {name}",\n    "newUser": "新しいユーザーが作成されます",\n    "sendInviteBtn": "招待を送信",\n    "backendError": "バックエンドが設定されていません。"\n  },'
);
fs.writeFileSync('src/i18n/te.json', fixed);
console.log('Fixed!');