import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { applyPalette, GIFEncoder, quantize } from "gifenc";
import { decompressFrames, parseGIF } from "gifuct-js";
import { useBackdropClose } from "../lib/useBackdropClose";
import Cropper from "react-easy-crop";

type Area = {
  width: number;
  height: number;
  x: number;
  y: number;
};

type Props = {
  open: boolean;
  imageSrc: string | null;
  sourceFile?: File | null;
  onClose: () => void;
  onApply: (file: File) => void;
  title?: string;
  cropShape?: "rect" | "round";
  aspect?: number;
  outputWidth?: number;
  outputHeight?: number;
  outputFileName?: string;
};

const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = (error) => reject(error);
    image.src = url;
  });

const OUTPUT_SIZE = 512;

const drawCroppedFrame = (source: CanvasImageSource, crop: Area, outW = OUTPUT_SIZE, outH = OUTPUT_SIZE): Uint8ClampedArray => {
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create canvas context");
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);

  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
};

const findTransparentIndex = (palette: number[][]): number => {
  return palette.findIndex((entry) => entry[3] === 0);
};

const cloneClampedArray = (source: Uint8ClampedArray): Uint8ClampedArray<ArrayBuffer> => {
  const clone = new Uint8ClampedArray(source.length);
  clone.set(source);
  return clone as Uint8ClampedArray<ArrayBuffer>;
};

const getCroppedGifFile = async (sourceFile: File, crop: Area, outputFileName: string, outW = OUTPUT_SIZE, outH = OUTPUT_SIZE): Promise<File> => {
  const arrayBuffer = await sourceFile.arrayBuffer();
  const parsedGif = parseGIF(arrayBuffer);
  const frames = decompressFrames(parsedGif, true);

  if (!frames.length) {
    throw new Error("Failed to read GIF frames");
  }

  const frameCanvas = document.createElement("canvas");
  frameCanvas.width = parsedGif.lsd.width;
  frameCanvas.height = parsedGif.lsd.height;

  const frameCtx = frameCanvas.getContext("2d", { willReadFrequently: true });
  if (!frameCtx) {
    throw new Error("Could not create GIF frame context");
  }

  const gif = GIFEncoder();
  let previousDisposalType = 0;
  let previousDims: Area | null = null;
  let previousRestoreData: ImageData | null = null;

  frames.forEach((frame, index) => {
    if (previousDims) {
      if (previousDisposalType === 2) {
        frameCtx.clearRect(previousDims.x, previousDims.y, previousDims.width, previousDims.height);
      } else if (previousDisposalType === 3 && previousRestoreData) {
        frameCtx.putImageData(previousRestoreData, previousDims.x, previousDims.y);
      }
    }

    const restoreData =
      frame.disposalType === 3
        ? frameCtx.getImageData(frame.dims.left, frame.dims.top, frame.dims.width, frame.dims.height)
        : null;

    frameCtx.putImageData(new ImageData(cloneClampedArray(frame.patch), frame.dims.width, frame.dims.height), frame.dims.left, frame.dims.top);

    const croppedRgba = drawCroppedFrame(frameCanvas, crop, outW, outH);
    const palette = quantize(croppedRgba, 256, {
      format: "rgba4444",
      oneBitAlpha: true,
      clearAlpha: true
    }) as number[][];
    const transparentIndex = findTransparentIndex(palette);
    const indexed = applyPalette(croppedRgba, palette, "rgba4444");

    gif.writeFrame(indexed, outW, outH, {
      palette,
      transparent: transparentIndex !== -1,
      transparentIndex: transparentIndex === -1 ? 0 : transparentIndex,
      delay: Math.max(frame.delay || 0, 20),
      repeat: index === 0 ? 0 : undefined,
      dispose: 1
    });

    previousDisposalType = frame.disposalType;
    previousDims = {
      x: frame.dims.left,
      y: frame.dims.top,
      width: frame.dims.width,
      height: frame.dims.height
    };
    previousRestoreData = restoreData;
  });

  gif.finish();
  return new File([Uint8Array.from(gif.bytes())], outputFileName, { type: "image/gif" });
};

const getCroppedAvatarFile = async (imageSrc: string, crop: Area, outputFileName: string, outW = OUTPUT_SIZE, outH = OUTPUT_SIZE): Promise<File> => {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create canvas context");
  }

  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    outW,
    outH
  );

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 0.95));
  if (!blob) {
    throw new Error("Failed to generate cropped image");
  }

  return new File([blob], outputFileName, { type: "image/png" });
};

const AvatarCropModal = ({
  open,
  imageSrc,
  sourceFile = null,
  onClose,
  onApply,
  title = "Edit Image",
  cropShape = "round",
  aspect = 1,
  outputWidth = OUTPUT_SIZE,
  outputHeight = OUTPUT_SIZE,
  outputFileName = "avatar.png"
}: Props): JSX.Element | null => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropPixels, setCropPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const { onBackdropPointerDown, onBackdropClick } = useBackdropClose(onClose);

  const image = useMemo(() => imageSrc, [imageSrc]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCropPixels(null);
    setBusy(false);
  }, [image, open]);

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCropPixels(croppedAreaPixels);
  }, []);

  const reset = (): void => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  const apply = async (): Promise<void> => {
    if (!cropPixels || !image) {
      return;
    }

    try {
      setBusy(true);
      const file = sourceFile?.type === "image/gif"
        ? await getCroppedGifFile(sourceFile, cropPixels, outputFileName, outputWidth, outputHeight)
        : await getCroppedAvatarFile(image, cropPixels, outputFileName, outputWidth, outputHeight);
      onApply(file);
      onClose();
      reset();
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && image ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4"
          onPointerDown={onBackdropPointerDown}
          onClick={onBackdropClick}
        >
          <motion.section
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.97 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="w-full max-w-lg rounded-lg bg-[#2b2d31] p-4"
            onClick={(event) => event.stopPropagation()}
          >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button className="text-sm text-discord-muted hover:text-white" onClick={onClose} aria-label="Close">
            x
          </button>
        </div>

        <div className="relative w-full overflow-hidden rounded-lg bg-[#11131a]" style={{ height: aspect >= 2 ? 220 : 320 }}>
          <Cropper
            image={image}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            cropShape={cropShape}
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="text-xs text-discord-muted">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="w-full"
          />
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button type="button" className="text-sm text-discord-muted hover:text-white" onClick={reset}>
            Reset
          </button>
          <div className="flex gap-2">
            <button type="button" className="rounded bg-[#3a3d45] px-3 py-1 text-sm font-semibold text-white" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="rounded bg-discord-blurple px-3 py-1 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => void apply()}
              disabled={busy}
            >
              {busy ? "Applying..." : "Apply"}
            </button>
          </div>
        </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};

export default AvatarCropModal;
