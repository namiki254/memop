// テスト用のページ
// issue #28 ブラウザの拡大縮小で画像とピンが位置ずれしないかどうか

// サンプルマップ、サンプルピン、サンプルのonPinClick（ピンをクリックしたときの表示）を用意している
// 最後にMapViewを包んでいる


import { useState } from "react";
import { MapView } from "../components/MapView.jsx";

export default function TestMapView() {
    // 選択中のピンの強調表示（issue #18）をログインせずに確認できるようにする
    const [selectedPinId, setSelectedPinId] = useState(null);

    // サンプルのマップ
    const sampleMap = {
        id: "map-1",
        title: "テスト用マップ: いらすとや台風",
        image_url: "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEh4czq6w3qUsBZ5P3tTlubobuDB_3-EvdtWpign4bNAJ_Onl3Liw8XW8D-prrG_iyBN-RMBa9Ybnn1F73ttMqtImaLhljwiX0T9pPZCQvLvH5xuzqitNKcXnWXGwXsTg0fJdqHywgNKJyYi/s1600/taifuu_top.png",
        // title: "テスト用マップ: いらすとや自転車（縦長・横長画像でもok）",
        // image_url: "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgILJUtaBxxRqWvEYwRsxla4-8ZV2fULB3QW8h-qF1pErJq6-9-em4N9ZT0FdWXVFcO59lwS-XEyJTs1EnzJZq968O7ujZD3VCPToPMWYujVRIpFInVs1mlr8mZSJmy40lrEaTWFZACv_hY/s800/bicycle_chikyu_lock.png",
    };

    // サンプルのピン（本来はクリックされた場所になるはず）
    const samplePins = [
        { id: "pin-1", title: "台風の目", x: 0.5, y: 0.5 },
        { id: "pin-2", title: "大陸", x: 0.15, y: 0.2 },
        { id: "pin-3", title: "島", x: 0.75, y: 0.85 },
    ];

    // ピンをクリックしたときの表示
    // （今、onPinClick={handlePinClick} になっている）
    const handlePinClick = (pin) => {
        console.log("クリックされたピン:", pin);
        // 同じピンをもう一度押すと選択を解除する（詳細パネルを閉じた状態の確認用）
        setSelectedPinId((current) => current === pin.id ? null : pin.id);
        // alert(`📍: ${pin.title} がクリックされました`);
    };

    return (
        /* 
        （重要）
        flex-col h-full で画面いっぱいに広げつつ、
        min-h-0 を指定して高さの上限を親（App.jsxのmain）に合わせる
        min-h-0 があることで、画面が極端に狭くなった時に要素が枠を押し広げて壊れるのを防止します。
        */
        <div className="flex h-full w-full min-h-0 flex-col p-4">
            {/* ページタイトルとテキスト */}
            <h2 className="text-lg font-bold">MapView 動作確認ページ</h2>
            <p className="mb-2 text-sm text-slate-600">
                ブラウザの幅を変えて、ピンの位置が画像上でずれないか確認してください。
            </p>

            {/* 
            （重要）
            min-h-0 h-0 flex-1 をセットで指定すると、
            どんなにブラウザを小さくしても画像が枠からはみ出さずにどこまでも縮小します
            Flexbox の仕様上、一度 h-0（または height: 0）を指定してから flex-1 で領域を埋めさせないと、
            中身の画像本来のサイズ（高さ）に引っ張られて親枠自体がどこまでも広がってしまいます。
            */}
            {/* MapViewを包むdiv */}
            <div className="h-0 min-h-0 flex-1 rounded border border-slate-300 bg-slate-50">
                <MapView
                    map={sampleMap}
                    pins={samplePins}
                    selectedPinId={selectedPinId}
                    onPinClick={handlePinClick}
                />
            </div>
        </div>
    );
}




