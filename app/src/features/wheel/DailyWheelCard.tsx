import { useLiveQuery } from 'dexie-react-hooks';
import { hasSpun, spinDailyWheel } from '../../db/repository';
import { dailySpinSource } from '../../domain/rpg/wheel';
import type { DayKey } from '../../domain/types';
import { SpinOffer } from './SpinOffer';

/** Home's Adventure pane: one free spin a day, in the member's own zone. */
export function DailyWheelCard({ coupleId, memberId, day }: { coupleId: string; memberId: string; day: DayKey }) {
  const source = dailySpinSource(day);
  const spun = useLiveQuery(() => hasSpun(memberId, source), [memberId, source]);

  return (
    <section className="wheel-card">
      <h2 className="section-title">Daily spin</h2>
      <p className="section-sub">
        {spun ? 'Spun for today. The wheel is back tomorrow.' : 'One free spin a day. Push the button and see where it lands.'}
      </p>
      <SpinOffer
        label={spun ? 'See the wheel' : 'Spin the wheel'}
        title="Daily spin"
        spent={spun === true}
        onSpin={() => spinDailyWheel(memberId, coupleId, day)}
      />
    </section>
  );
}
