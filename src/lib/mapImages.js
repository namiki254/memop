import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

export const MAP_IMAGE_BUCKET = "map-images";

// 既存の image_url から Storage 内のファイル名を取り出す。
const storageImageUrl = /^https?:\/\/[^/?#]+\/storage\/v1\/object\/public\/map-images\/([A-Za-z0-9_./-]+)(?:[?#].*)?$/;

export function useMapImage(imageUrl, lazy = false) {
  const imageContainer = useRef(null);
  const [downloadedImage, setDownloadedImage] = useState(null);
  const storagePath = imageUrl?.match(storageImageUrl)?.[1];

  useEffect(() => {
    if (!storagePath) return;

    const controller = new AbortController();
    let objectUrl;
    let observer;

    async function loadImage() {
      try {
        const { data, error } = await supabase.storage
          .from(MAP_IMAGE_BUCKET)
          .download(storagePath, {}, { cache: "no-store", signal: controller.signal });

        if (controller.signal.aborted) return;
        if (error) throw error;

        objectUrl = URL.createObjectURL(data);
        setDownloadedImage({ imageUrl, src: objectUrl });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("マップ画像の読み込みに失敗", error);
        setDownloadedImage({ imageUrl, src: null });
      }
    }

    // 一覧では画面の近くに来たサムネイルだけを読み込む。
    if (lazy && imageContainer.current && typeof IntersectionObserver === "function") {
      observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          observer.disconnect();
          loadImage();
        },
        { rootMargin: "160px" },
      );
      observer.observe(imageContainer.current);
    } else {
      loadImage();
    }

    return () => {
      controller.abort();
      observer?.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageUrl, lazy, storagePath]);

  if (!storagePath) return { src: imageUrl, loading: false, imageContainer };
  if (downloadedImage?.imageUrl !== imageUrl) {
    return { src: null, loading: true, imageContainer };
  }
  return { src: downloadedImage.src, loading: false, imageContainer };
}
