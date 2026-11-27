import { MAP_VISIBILITIES } from "../lib/mapVisibility.js";

export default function MapVisibilitySelect({ id, value, onChange, disabled = false }) {
  const selected = MAP_VISIBILITIES.find((scope) => scope.value === value);
  return (
    <div className="mt-3">
      <label htmlFor={id} className="label">公開範囲</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}
        disabled={disabled} aria-describedby={`${id}-description`}
        className="field mt-1">
        {MAP_VISIBILITIES.map((scope) => <option key={scope.value} value={scope.value}>{scope.label}</option>)}
      </select>
      <p id={`${id}-description`} className="mt-1.5 text-sm text-sub">{selected?.description}</p>
    </div>
  );
}
