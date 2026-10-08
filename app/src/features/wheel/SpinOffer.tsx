import { useState } from 'react';
import type { WheelSpin } from '../../db/repository';
import { SecondaryAction } from '../../ui/SecondaryAction';
import { Sheet } from '../../ui/Sheet';
import { Wheel } from './Wheel';

/**
 * A button that opens the wheel in a bottom sheet.
 *
 * Stays mounted whether or not the spin has been taken: the card that holds it
 * flips to "spun" the moment the prize is paid, which is *during* the spin, and
 * unmounting then would close the sheet on the picture of the result.
 */
export interface SpinOfferProps {
  label: string;
  title: string;
  onSpin: () => Promise<WheelSpin | null>;
  spent?: boolean;
}

export function SpinOffer({ label, title, onSpin, spent = false }: SpinOfferProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <SecondaryAction onClick={() => setOpen(true)}>{label}</SecondaryAction>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        label={title}
        scrimClassName="menu-scrim"
        panelClassName="menu-panel wheel-sheet"
        draggable
      >
        <h2 className="section-title">{title}</h2>
        <Wheel onSpin={onSpin} spent={spent} />
      </Sheet>
    </>
  );
}
