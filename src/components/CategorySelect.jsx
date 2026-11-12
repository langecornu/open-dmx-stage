// Choose what kind of device something is (par, moving head, smoke machine…). The first choice leaves it to the fixture
// type, or to a guess, and says what that is.
import { CATEGORY_INFO, DEVICE_CATEGORIES } from '../../shared/categories.js';

/**
 * @param {{ value: string, inherited: string, inheritedFrom: string, onChange: (value: string) => void, label: string,
 *   className?: string }} props `value` is '' when nothing is set here; `inherited` is the category used then, and
 *   `inheritedFrom` says where it comes from ("the fixture", "a guess")
 */
export function CategorySelect({ value, inherited, inheritedFrom, onChange, label, className = 'select' }) {
  return (
    <select className={className} value={value} aria-label={label} onChange={(event) => onChange(event.target.value)}>
      <option value="">
        {CATEGORY_INFO[inherited]?.label ?? 'Other'} ({inheritedFrom})
      </option>
      {DEVICE_CATEGORIES.map((category) => (
        <option key={category} value={category}>
          {CATEGORY_INFO[category].label}
        </option>
      ))}
    </select>
  );
}
