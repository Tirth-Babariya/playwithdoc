"use client";

import type { OptionSpec, Opts } from "@/lib/types";

/** Starting values for a tool's options. */
export function defaults(specs: OptionSpec[] | undefined): Opts {
  const o: Opts = {};
  for (const s of specs ?? []) o[s.key] = s.default;
  return o;
}

/** One option control (segmented buttons, dropdown, slider, text or number) driven by a tool's OptionSpec. */
export function Field({ spec, value, onChange, idPrefix = "opt" }: { spec: OptionSpec; value: any; onChange: (v: any) => void; idPrefix?: string }) {
  const id = `${idPrefix}-${spec.key}`;
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">{spec.label}{spec.type === "range" && <b>{(spec.format ?? String)(value)}</b>}</label>
      {spec.type === "select" && (spec.options.length <= 4 ? (
        <div className="seg" role="radiogroup" aria-label={spec.label}>
          {spec.options.map((o) => (
            <button key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)} title={o.hint}>{o.label}</button>
          ))}
        </div>
      ) : (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>{spec.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
      ))}
      {spec.type === "select" && spec.options.find((o) => o.value === value)?.hint && <div className="field-help">{spec.options.find((o) => o.value === value)!.hint}</div>}
      {spec.type === "range" && <input id={id} type="range" min={spec.min} max={spec.max} step={spec.step} value={value} style={{ "--pct": `${((value - spec.min) / (spec.max - spec.min)) * 100}%` } as React.CSSProperties} onChange={(e) => onChange(+e.target.value)} />}
      {spec.type === "text" && <input id={id} type={spec.secret ? "password" : "text"} autoComplete={spec.secret ? "off" : undefined} value={value ?? ""} placeholder={spec.placeholder} onChange={(e) => onChange(e.target.value)} spellCheck={false} />}
      {spec.type === "number" && (
        <div className="num">
          <input id={id} type="number" min={spec.min} max={spec.max} value={value} onChange={(e) => onChange(e.target.value === "" ? "" : +e.target.value)} />
          {spec.suffix && <span>{spec.suffix}</span>}
        </div>
      )}
      {spec.help && <div className="field-help">{spec.help}</div>}
    </div>
  );
}
