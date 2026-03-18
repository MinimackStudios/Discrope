import { useRef } from "react";
import type { MouseEvent, PointerEvent } from "react";

type BackdropElement = HTMLElement;

export const useBackdropClose = (onClose: () => void) => {
  const pointerStartedOnBackdropRef = useRef(false);

  const onBackdropPointerDown = (event: PointerEvent<BackdropElement>): void => {
    pointerStartedOnBackdropRef.current = event.target === event.currentTarget;
  };

  const onBackdropClick = (event: MouseEvent<BackdropElement>): void => {
    const shouldClose = pointerStartedOnBackdropRef.current && event.target === event.currentTarget;
    pointerStartedOnBackdropRef.current = false;
    if (shouldClose) {
      onClose();
    }
  };

  return {
    onBackdropPointerDown,
    onBackdropClick
  };
};