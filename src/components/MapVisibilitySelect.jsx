import { MAP_VISIBILITIES } from "../lib/mapVisibility.js";

export default function MapVisibilitySelect({ id, value, onChange, disabled = false }) {
  const selected = MAP_VISIBILITIES.find((scope) => scope.value === value);
  return (
    <div className="mt-3 rounded-lg border border-rose-100 bg-rose-50/30 p-3">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">公開範囲</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}
        disabled={disabled} aria-describedby={`${id}-description`}
        className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50">
        {MAP_VISIBILITIES.map((scope) => <option key={scope.value} value={scope.value}>{scope.label}</option>)}
      </select>
      <p id={`${id}-description`} className="mt-2 text-sm text-slate-600">{selected?.description}</p>
    </div>
  );
}
