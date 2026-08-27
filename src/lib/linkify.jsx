// src/lib/linkify.jsx の実装イメージ
const URL_PATTERN = /(https?:\/\/[^\s]+)/g;   // http:// or https:// から始まるurlの正規表現

// テキストを受け取り、url部分をリンク化した配列を返す関数
export function renderTextWithLinks(text) {
    if (!text) return null;   // textが空などの場合、安全にnullを返して中断

    // URLで文字列を分割（キャプチャグループ () を使っているためURL自体も配列に含まれる）
    const parts = text.split(URL_PATTERN);   // テキストを文字列とurlに分割し、配列として取得

    // 分割された各パーツを順番に取り出し、配列へ変換するためのループ処理
    return parts.map((part, index) => {
        // 正規表現にマッチする（URLである）場合 -> リンクを付ける
        if (part.match(/^https?:\/\//)) {
            return (
                <a   // タグの記述を開始
                    key={index}
                    href={part}   // リンク先のurl
                    target="_blank"   // クリックしたら新しいタブでページを開くように設定
                    rel="noopener noreferrer"   // 新しいタブから元のページが操作されるセキュリティリスクを防ぐための保護属性を追加
                    className="text-blue-600 underline hover:text-blue-800"   // リンクを青色、下線付き、ホバー時に濃い青色で装飾
                >
                    {part}
                </a>
            );
        }
        // 通常のテキストの場合 -> そのままの文字列を返す
        return part;
    });
}