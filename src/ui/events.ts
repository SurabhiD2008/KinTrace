import type { MouseEvent } from 'react';

/**
 * A click handler for buttons that create something. The second click of a
 * double-click (event.detail 2 or more) is ignored, so a double-click adds one
 * person, not two. Keyboard presses have detail 0 and always count.
 */
export function singleClick(handler: () => void): (event: MouseEvent) => void {
  return (event) => {
    if (event.detail > 1) return;
    handler();
  };
}
