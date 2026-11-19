// Filters for a long list of looks or sequences: by colour palette, by speed (sequences) and by style. Only the choices
// that some item has are offered, each with how many it would show.
import { PALETTES, SPEEDS, STYLES } from '../utils/lookTags.js';

const count = (tagsList, pick, value) => tagsList.filter((tags) => pick(tags, value)).length;

/**
 * @param {{
 *   tagsList: { palette: string | null, speed?: string, styles: Set<string> }[],
 *   filter: { palette: string, speed: string, style: string },
 *   onChange: (filter: { palette: string, speed: string, style: string }) => void,
 *   shown: number,
 *   withSpeed?: boolean,
 * }} props
 */
export function LookFilters({ tagsList, filter, onChange, shown, withSpeed = false }) {
  const set = (changes) => onChange({ ...filter, ...changes });
  const isFiltered = filter.palette !== 'all' || filter.speed !== 'all' || filter.style !== 'all';
  const groups = [
    {
      key: 'palette',
      label: 'Palette',
      values: PALETTES,
      has: (tags, value) => tags.palette === value,
    },
    ...(withSpeed
      ? [{ key: 'speed', label: 'Speed', values: SPEEDS, has: (tags, value) => tags.speed === value }]
      : []),
    { key: 'style', label: 'Style', values: STYLES, has: (tags, value) => tags.styles.has(value) },
  ];
  return (
    <div className="toolbar look-filters" role="group" aria-label="Filter">
      {groups.map(({ key, label, values, has }) => (
        <label key={key} className="field field-inline">
          {label}
          <select
            className="select select-compact"
            value={filter[key]}
            onChange={(event) => set({ [key]: event.target.value })}
          >
            <option value="all">All</option>
            {values
              .filter((value) => count(tagsList, has, value) > 0 || filter[key] === value)
              .map((value) => (
                <option key={value} value={value}>
                  {value} ({count(tagsList, has, value)})
                </option>
              ))}
          </select>
        </label>
      ))}
      <span className="view-sub">
        {shown} of {tagsList.length} shown
      </span>
      {isFiltered ? (
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => onChange({ palette: 'all', speed: 'all', style: 'all' })}
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
