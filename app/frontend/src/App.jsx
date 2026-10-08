import { useEffect, useId, useRef, useState } from "react";

// Starting answers. Field names match PersonInput in app/backend/risk_engine.py.
const DEFAULTS = {
  sex: "Female",
  age: 45,
  height_feet: 5,
  height_inches: 7,
  weight_lbs: 170,
  smoker_status: "Never smoked",
  ecig_usage: "Never used",
  alcohol: true,
  physical_activity: true,
  sleep_hours: 7,
  general_health: "Very good",
  physical_health_days: 0,
  mental_health_days: 0,
  difficulty_walking: false,
  race: "White",
  last_checkup: "Within the past year",
  removed_teeth: "None",
  deaf_or_hard_of_hearing: false,
  blind_or_vision_difficulty: false,
  difficulty_concentrating: false,
  difficulty_dressing_bathing: false,
  difficulty_errands: false,
  flu_vaccine_last_12_months: true,
  pneumonia_vaccine_ever: false,
  tetanus_last_10_years: "No",
  hiv_tested: false,
  hiv_high_risk_last_year: false,
  covid_positive: "No",
  chest_scan: false,
};

const CONDITIONS = {
  HadHeartAttack: "Heart attack",
  HadAngina: "Angina",
  HadStroke: "Stroke",
  HadAsthma: "Asthma",
  HadSkinCancer: "Skin cancer",
  HadCOPD: "COPD",
  HadDepression: "Depression",
  HadKidneyDisease: "Kidney disease",
  HadArthritis: "Arthritis",
  HadDiabetes: "Diabetes",
};
const NO_CONDITIONS = Object.fromEntries(Object.keys(CONDITIONS).map((k) => [k, false]));

const YES_NO = [
  { value: true, label: "Yes" },
  { value: false, label: "No" },
];

// Risk track: log scale from 0.1% to 100%
const LOG_MIN = Math.log10(0.001);
const position = (p) => {
  const clamped = Math.min(Math.max(p, 0.001), 1);
  return ((Math.log10(clamped) - LOG_MIN) / -LOG_MIN) * 100;
};
const pct = (p) => (p < 0.001 ? "<0.1%" : `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`);

// shows value by (x in 100) or (x in 1000)
const trim = (n) => String(Number(n.toFixed(1)));
const freq = (p) => {
  if (p >= 0.1) return `${Math.round(p * 100)} in 100`;
  if (p >= 0.01) return `${trim(p * 100)} in 100`;
  if (p >= 0.001) return `${Math.round(p * 1000)} in 1,000`;
  return "fewer than 1 in 1,000";
};
// What each condition's sentence says people "have ..."
const HAVE = {
  HadHeartAttack: "had a heart attack",
  HadAngina: "been diagnosed with angina",
  HadStroke: "had a stroke",
  HadAsthma: "been diagnosed with asthma",
  HadSkinCancer: "been diagnosed with skin cancer",
  HadCOPD: "been diagnosed with COPD",
  HadDepression: "been diagnosed with depression",
  HadKidneyDisease: "been diagnosed with kidney disease",
  HadArthritis: "been diagnosed with arthritis",
  HadDiabetes: "been diagnosed with diabetes",
};

const LEVELS = [
  { name: "Below average", rule: "Less than two-thirds of the average adult’s chance." },
  { name: "Average", rule: "Between two-thirds and 1.5 times the average." },
  { name: "Elevated", rule: "1.5 to 3 times the average." },
  { name: "High", rule: "3 times the average or more." },
];
const levelClass = (name) => `level-${name.toLowerCase().replace(" ", "-")}`;

export default function App() {
  const [form, setForm] = useState(DEFAULTS);
  const [includeConditions, setIncludeConditions] = useState(false);
  const [conditions, setConditions] = useState(NO_CONDITIONS);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const firstRun = useRef(true);
  const resultsRef = useRef(null);
  const latestRequest = useRef(0);

  const set = (name) => (value) => setForm((f) => ({ ...f, [name]: value }));

  async function checkRisk() {
    // Number each request so a slow, older response can't overwrite a newer one
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError(null);
    try {
      const body = { ...form, conditions: includeConditions ? conditions : null };
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // If the backend is down, the dev server answers with an error page instead of JSON
      const data = await res.json().catch(() => null);
      if (requestId !== latestRequest.current) return;
      if (!data) throw new TypeError("No response from the risk server");
      if (!res.ok) throw new Error(describeError(data));
      setResult(data);
      // On narrow screens results sit below the form, so bring them into view after the first check
      if (!result && window.innerWidth < 860) {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch (e) {
      if (requestId !== latestRequest.current) return;
      setError(
        e instanceof TypeError
          ? "Can't reach the risk server. Start it from the project folder with: python -m uvicorn app.backend.main:app --reload"
          : e.message
      );
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }

  // After the first check, results update automatically as answers change
  useEffect(() => {
    if (firstRun.current || !result) return;
    const timer = setTimeout(checkRisk, 300);
    return () => clearTimeout(timer);
  }, [form, includeConditions, conditions]);

  function onSubmit(e) {
    e.preventDefault();
    firstRun.current = false;
    checkRisk();
  }

  return (
    <div className="page">
      <header className="intro">
        <h1>Health risk check</h1>
        <p>
          Answer a few questions to see your estimated chance of having ten common conditions,
          compared with the average U.S. adult. The estimates come from models trained on
          246,013 adults in the CDC’s 2022 Behavioral Risk Factor Surveillance System.
        </p>
      </header>

      <main className="layout">
        <form className="questions" onSubmit={onSubmit}>
          <fieldset>
            <legend>About you</legend>
            <Segmented label="Sex" value={form.sex} onChange={set("sex")}
              options={["Female", "Male"]} />
            <NumberField label="Age" unit="years" value={form.age} onChange={set("age")} min={18} max={99} />
            <div className="pair">
              <NumberField label="Height" unit="ft" value={form.height_feet} onChange={set("height_feet")} min={3} max={7} />
              <NumberField label={"\u00a0"} ariaLabel="Height inches" unit="in" value={form.height_inches} onChange={set("height_inches")} min={0} max={11} />
            </div>
            <NumberField label="Weight" unit="lbs" value={form.weight_lbs} onChange={set("weight_lbs")} min={60} max={650} />
          </fieldset>

          <fieldset>
            <legend>Habits</legend>
            <Select label="Smoking" value={form.smoker_status} onChange={set("smoker_status")}
              options={["Never smoked", "Former smoker", "Smokes some days", "Smokes every day"]} />
            <Select label="E-cigarettes" value={form.ecig_usage} onChange={set("ecig_usage")}
              options={["Never used", "Used before, not now", "Some days", "Every day"]} />
            <Segmented label="Had alcohol in the past 30 days" value={form.alcohol} onChange={set("alcohol")} options={YES_NO} />
            <Segmented label="Exercised in the past 30 days, outside of work" value={form.physical_activity}
              onChange={set("physical_activity")} options={YES_NO} />
            <NumberField label="Sleep on an average night" unit="hours" value={form.sleep_hours}
              onChange={set("sleep_hours")} min={1} max={24} />
          </fieldset>

          <fieldset>
            <legend>Recent health</legend>
            <Segmented label="General health" value={form.general_health} onChange={set("general_health")}
              options={["Poor", "Fair", "Good", "Very good", "Excellent"]} />
            <NumberField label="Days your physical health was not good, past 30" unit="days"
              value={form.physical_health_days} onChange={set("physical_health_days")} min={0} max={30} />
            <NumberField label="Days your mental health was not good, past 30" unit="days"
              value={form.mental_health_days} onChange={set("mental_health_days")} min={0} max={30} />
            <Segmented label="Serious difficulty walking or climbing stairs" value={form.difficulty_walking}
              onChange={set("difficulty_walking")} options={YES_NO} />
          </fieldset>

          <fieldset>
            <legend>Diagnosed conditions</legend>
            <label className="check lead">
              <input type="checkbox" checked={includeConditions}
                onChange={(e) => setIncludeConditions(e.target.checked)} />
              Use conditions I’ve been diagnosed with
            </label>
            <p className="hint">
              Conditions are linked, so this makes estimates more accurate. For example,
              angina raises the chance of a heart attack.
            </p>
            {includeConditions && (
              <div className="condition-grid">
                {Object.entries(CONDITIONS).map(([key, label]) => (
                  <label className="check" key={key}>
                    <input type="checkbox" checked={conditions[key]}
                      onChange={(e) => setConditions((c) => ({ ...c, [key]: e.target.checked }))} />
                    {label}
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <details className="more">
            <summary>More details (optional)</summary>
            <p className="hint">Left as is, these use the most common survey answer.</p>
            <Select label="Race and ethnicity" value={form.race} onChange={set("race")}
              options={["White", "Black", "Hispanic", "Other", "Multiracial"]} />
            <Select label="Last routine checkup" value={form.last_checkup} onChange={set("last_checkup")}
              options={["Within the past year", "1 to 2 years ago", "2 to 5 years ago", "5 or more years ago"]} />
            <Select label="Teeth removed due to decay or gum disease" value={form.removed_teeth}
              onChange={set("removed_teeth")} options={["None", "1 to 5", "6 or more, but not all", "All"]} />
            <Select label="Tetanus shot in the past 10 years" value={form.tetanus_last_10_years}
              onChange={set("tetanus_last_10_years")} options={["No", "Yes, Tdap", "Yes, not Tdap", "Yes, unsure of type"]} />
            <Select label="Ever tested positive for COVID-19" value={form.covid_positive}
              onChange={set("covid_positive")} options={["No", "Yes", "Yes, home test only"]} />
            <div className="toggles">
              {[
                ["deaf_or_hard_of_hearing", "Deaf or serious difficulty hearing"],
                ["blind_or_vision_difficulty", "Blind or serious difficulty seeing"],
                ["difficulty_concentrating", "Serious difficulty concentrating or remembering"],
                ["difficulty_dressing_bathing", "Difficulty dressing or bathing"],
                ["difficulty_errands", "Difficulty doing errands alone"],
                ["flu_vaccine_last_12_months", "Flu shot in the past 12 months"],
                ["pneumonia_vaccine_ever", "Ever had a pneumonia vaccine"],
                ["chest_scan", "Ever had a CT or CAT scan of the chest"],
                ["hiv_tested", "Ever tested for HIV"],
                ["hiv_high_risk_last_year", "HIV risk situation in the past year"],
              ].map(([key, label]) => (
                <label className="check" key={key}>
                  <input type="checkbox" checked={form[key]} onChange={(e) => set(key)(e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>
          </details>

          <button type="submit" className="submit" disabled={loading}>
            {loading ? "Checking…" : "Check my risk"}
          </button>
        </form>

        <section className="results" aria-live="polite" ref={resultsRef}>
          {error && <p className="error">{error}</p>}
          {!result && !error && (
            <div className="empty">
              <h2>Your results</h2>
              <p>
                Fill in the form and select Check my risk. Each condition will show your estimated
                chance next to the average adult’s, and results update as you change answers.
              </p>
            </div>
          )}
          {result && <Results result={result} />}
        </section>
      </main>
    </div>
  );
}

function Results({ result }) {
  const predicted = result.results.filter((r) => !r.already_has);
  const reported = result.results.filter((r) => r.already_has);
  return (
    <>
      <div className="results-head">
        <h2>Your results</h2>
        <p className="meta">
          BMI {result.bmi.toFixed(1)}. Based on{" "}
          {result.model_set === "full" ? "your answers and diagnosed conditions" : "your answers only"}.
        </p>
      </div>

      <details className="key" open>
        <summary>How to read your results</summary>
        <p>
          Each bar compares you with the average U.S. adult. The line marks the average: how
          many of the 246,013 adults in the survey have the condition. The dot marks people
          with answers like yours. Further right means more likely; each step along the bar
          is ten times the one before, from 0.1% to 100%.
        </p>
        <dl className="levels">
          {LEVELS.map((l) => (
            <div key={l.name} className={levelClass(l.name)}>
              <dt><i className="swatch" aria-hidden="true" />{l.name}</dt>
              <dd>{l.rule}</dd>
            </div>
          ))}
        </dl>
      </details>

      <ol className="risk-list">
        {predicted.map((r) => (
          <li key={r.condition} className={`risk ${levelClass(r.level)}`}>
            <div className="risk-top">
              <span className="name">{r.label}</span>
              <span className="level">{r.level}</span>
            </div>
            <div className="track" role="img"
              aria-label={`${r.label}: ${pct(r.probability)}, average ${pct(r.average)}`}>
              <span className="avg" style={{ left: `${position(r.average)}%` }} />
              <span className="you" style={{ left: `${position(r.probability)}%` }} />
            </div>
            <p className="risk-sentence">
              <strong>About {freq(r.probability)}</strong> people with answers like yours have{" "}
              {HAVE[r.condition]}. Among all adults it’s about {freq(r.average)}.
            </p>
          </li>
        ))}
      </ol>

      {reported.length > 0 && (
        <p className="reported">
          Not estimated because you reported them: {reported.map((r) => r.label).join(", ")}.
        </p>
      )}

      <p className="disclaimer">
        These are statistical estimates from self-reported survey data, for educational use only.
        They are not a diagnosis. Your answers are not stored.
      </p>
    </>
  );
}

function describeError(data) {
  if (Array.isArray(data.detail)) {
    return data.detail.map((d) => `${d.loc.at(-1).replaceAll("_", " ")}: ${d.msg}`).join(". ");
  }
  return data.detail || "Something went wrong with that request.";
}

function Segmented({ label, value, onChange, options }) {
  const opts = options.map((o) => (typeof o === "object" ? o : { value: o, label: o }));
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {opts.map((o) => (
          <button type="button" key={String(o.value)} role="radio" aria-checked={value === o.value}
            className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function NumberField({ label, ariaLabel, unit, value, onChange, min, max }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <span className="number">
        <input id={id} aria-label={ariaLabel} type="number" value={value} min={min} max={max} step="any" required
          aria-describedby={`${id}-unit`}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
        <span className="unit" id={`${id}-unit`}>{unit}</span>
      </span>
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}
