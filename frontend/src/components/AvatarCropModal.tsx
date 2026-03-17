import { useCallback, useMemo, useState } from "react";
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
  onClose: () => void;
  onApply: (file: File) => void;
  title?: string;
  cropShape?: "rect" | "round";
  outputFileName?: string;
};

const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = (error) => reject(error);
    image.src = url;
  });

const getCroppedAvatarFile = async (imageSrc: string, crop: Area, outputFileName: string): Promise<File> => {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;

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
    canvas.width,
    canvas.height
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
  onClose,
  onApply,
  title = "Edit Image",
  cropShape = "round",
  outputFileName = "avatar.png"
}: Props): JSX.Element | null => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropPixels, setCropPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const image = useMemo(() => imageSrc, [imageSrc]);

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCropPixels(croppedAreaPixels);
  }, []);

  if (!open || !image) {
    return null;
  }

  const reset = (): void => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  const apply = async (): Promise<void> => {
    if (!cropPixels) {
      return;
    }

    try {
      setBusy(true);
      const file = await getCroppedAvatarFile(image, cropPixels, outputFileName);
      onApply(file);
      onClose();
      reset();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <section className="w-full max-w-lg rounded-lg bg-[#2b2d31] p-4" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button className="text-sm text-discord-muted hover:text-white" onClick={onClose} aria-label="Close">
            x
          </button>
        </div>

        <div className="relative h-[320px] w-full overflow-hidden rounded-lg bg-[#11131a]">
          <Cropper
            image={image}
            crop={crop}
            zoom={zoom}
            aspect={1}
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
      </section>
    </div>
  );
};

export default AvatarCropModal;
