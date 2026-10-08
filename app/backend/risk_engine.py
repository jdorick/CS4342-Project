"""Model logic for the app: input schema, answer conversion, and risk prediction.

Kept separate from the web server (main.py) so it can be tested and reused on its own.

How a prediction works:
  1. The person's answers arrive as a PersonInput (validated by Pydantic).
  2. to_model_row() converts them to the numeric columns the models were trained on,
     using the same mappings as Preprocessing.ipynb (e.g. "Very good" -> 4, age 30 -> 32).
  3. Each condition's saved pipeline returns a raw score.
  4. The raw score is converted to a real world probability (see to_probability).
  5. That probability is compared with the average adult's rate for the condition.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Literal, Optional

import joblib
import pandas as pd
from pydantic import BaseModel, Field

MODELS_DIR = Path(__file__).resolve().parents[2] / "models"

CONDITIONS = {
    "HadHeartAttack": "Heart attack",
    "HadAngina": "Angina",
    "HadStroke": "Stroke",
    "HadAsthma": "Asthma",
    "HadSkinCancer": "Skin cancer",
    "HadCOPD": "COPD",
    "HadDepression": "Depression",
    "HadKidneyDisease": "Kidney disease",
    "HadArthritis": "Arthritis",
    "HadDiabetes": "Diabetes",
}
ConditionKey = Literal[
    "HadHeartAttack", "HadAngina", "HadStroke", "HadAsthma", "HadSkinCancer",
    "HadCOPD", "HadDepression", "HadKidneyDisease", "HadArthritis", "HadDiabetes",
]


# Input schema: what the frontend sends. Invalid values are rejected with a 422.
# Fields after "More details" have defaults (the most common survey answer).
GeneralHealth = Literal["Poor", "Fair", "Good", "Very good", "Excellent"]
Smoker = Literal["Never smoked", "Former smoker", "Smokes some days", "Smokes every day"]
ECig = Literal["Never used", "Used before, not now", "Some days", "Every day"]
Race = Literal["White", "Black", "Hispanic", "Other", "Multiracial"]
Checkup = Literal["Within the past year", "1 to 2 years ago", "2 to 5 years ago", "5 or more years ago"]
Teeth = Literal["None", "1 to 5", "6 or more, but not all", "All"]
Tetanus = Literal["No", "Yes, Tdap", "Yes, not Tdap", "Yes, unsure of type"]
Covid = Literal["No", "Yes", "Yes, home test only"]


class PersonInput(BaseModel):
    # About you
    sex: Literal["Female", "Male"]
    age: int = Field(ge=18, le=99)
    height_feet: int = Field(ge=3, le=7)
    height_inches: float = Field(ge=0, lt=12)
    weight_lbs: float = Field(ge=60, le=650)
    # Habits
    smoker_status: Smoker = "Never smoked"
    ecig_usage: ECig = "Never used"
    alcohol: bool = True
    physical_activity: bool = True
    sleep_hours: float = Field(default=7, ge=1, le=24)
    # Recent health
    general_health: GeneralHealth = "Very good"
    physical_health_days: int = Field(default=0, ge=0, le=30)
    mental_health_days: int = Field(default=0, ge=0, le=30)
    difficulty_walking: bool = False
    # More details
    race: Race = "White"
    last_checkup: Checkup = "Within the past year"
    removed_teeth: Teeth = "None"
    deaf_or_hard_of_hearing: bool = False
    blind_or_vision_difficulty: bool = False
    difficulty_concentrating: bool = False
    difficulty_dressing_bathing: bool = False
    difficulty_errands: bool = False
    flu_vaccine_last_12_months: bool = True
    pneumonia_vaccine_ever: bool = False
    tetanus_last_10_years: Tetanus = "No"
    hiv_tested: bool = False
    hiv_high_risk_last_year: bool = False
    covid_positive: Covid = "No"
    chest_scan: bool = False
    # Existing conditions: leave out (null) to use the lifestyle models.
    # When given, the full models are used and every condition must be answered.
    conditions: Optional[dict[ConditionKey, bool]] = None


# Same mappings as Preprocessing.ipynb
GENERAL_HEALTH = {"Poor": 1, "Fair": 2, "Good": 3, "Very good": 4, "Excellent": 5}
SMOKER = {"Never smoked": 0, "Former smoker": 1, "Smokes some days": 2, "Smokes every day": 3}
CHECKUP = {"5 or more years ago": 0, "2 to 5 years ago": 1, "1 to 2 years ago": 2, "Within the past year": 3}
TEETH = {"None": 0, "1 to 5": 1, "6 or more, but not all": 2, "All": 3}
AGE_GROUPS = [(24, 21), (29, 27), (34, 32), (39, 37), (44, 42), (49, 47), (54, 52),
              (59, 57), (64, 62), (69, 67), (74, 72), (79, 77), (200, 80)]
# Short app labels -> the exact text in the survey data
ECIG_TEXT = {
    "Never used": "Never used e-cigarettes in my entire life",
    "Used before, not now": "Not at all (right now)",
    "Some days": "Use them some days",
    "Every day": "Use them every day",
}
RACE_TEXT = {
    "White": "White only, Non-Hispanic", "Black": "Black only, Non-Hispanic", "Hispanic": "Hispanic",
    "Other": "Other race only, Non-Hispanic", "Multiracial": "Multiracial, Non-Hispanic",
}
TETANUS_TEXT = {
    "No": "No, did not receive any tetanus shot in the past 10 years",
    "Yes, Tdap": "Yes, received Tdap",
    "Yes, not Tdap": "Yes, received tetanus shot, but not Tdap",
    "Yes, unsure of type": "Yes, received tetanus shot but not sure what type",
}
COVID_TEXT = {"No": "No", "Yes": "Yes",
              "Yes, home test only": "Tested positive using home test without a health professional"}


def to_model_row(p: PersonInput) -> dict:
    """Convert app answers into the column names and values the models were trained on."""
    height_m = round((p.height_feet * 12 + p.height_inches) * 0.0254, 2)
    weight_kg = round(p.weight_lbs * 0.453592, 2)
    return {
        "Sex": p.sex,
        "AgeCategory": next(mid for top, mid in AGE_GROUPS if p.age <= top),
        "HeightInMeters": height_m,
        "WeightInKilograms": weight_kg,
        "BMI": round(weight_kg / height_m ** 2, 2),
        "GeneralHealth": GENERAL_HEALTH[p.general_health],
        "SmokerStatus": SMOKER[p.smoker_status],
        "ECigaretteUsage": ECIG_TEXT[p.ecig_usage],
        "AlcoholDrinkers": int(p.alcohol),
        "PhysicalActivities": int(p.physical_activity),
        "SleepHours": p.sleep_hours,
        "PhysicalHealthDays": p.physical_health_days,
        "MentalHealthDays": p.mental_health_days,
        "DifficultyWalking": int(p.difficulty_walking),
        "RaceEthnicityCategory": RACE_TEXT[p.race],
        "LastCheckupTime": CHECKUP[p.last_checkup],
        "RemovedTeeth": TEETH[p.removed_teeth],
        "DeafOrHardOfHearing": int(p.deaf_or_hard_of_hearing),
        "BlindOrVisionDifficulty": int(p.blind_or_vision_difficulty),
        "DifficultyConcentrating": int(p.difficulty_concentrating),
        "DifficultyDressingBathing": int(p.difficulty_dressing_bathing),
        "DifficultyErrands": int(p.difficulty_errands),
        "FluVaxLast12": int(p.flu_vaccine_last_12_months),
        "PneumoVaxEver": int(p.pneumonia_vaccine_ever),
        "TetanusLast10Tdap": TETANUS_TEXT[p.tetanus_last_10_years],
        "HIVTesting": int(p.hiv_tested),
        "HighRiskLastYear": int(p.hiv_high_risk_last_year),
        "CovidPos": COVID_TEXT[p.covid_positive],
        "ChestScan": int(p.chest_scan),
    }


def correct_probability(score: float, base_rate: float) -> float:
    """Undo the effect of class_weight="balanced" on the model's output.

    Balanced weights train the model as if the condition were as common as not having it,
    which multiplies the odds by (1 - base_rate) / base_rate. Multiplying back by
    base_rate / (1 - base_rate) recovers a real-world probability (prior correction).
    On the test set the corrected values match the observed rates in every quintile.
    """
    score = min(max(score, 1e-6), 1 - 1e-6)
    odds = score / (1 - score) * base_rate / (1 - base_rate)
    return odds / (1 + odds)


def to_probability(bundle: dict, score: float) -> float:
    """Turn a model's raw score into a real-world probability.

    Uses the isotonic calibrator saved with each model by Condition_Models.ipynb (fit on the
    cross-validated training scores). Falls back to the prior correction for older model files
    without one. On the test set both match the observed rates equally well.
    """
    if "calibrator" in bundle:
        return float(bundle["calibrator"].predict([score])[0])
    return correct_probability(score, bundle["test_metrics"]["base_rate"])


def risk_level(relative: float) -> str:
    """Bucket a person's risk by how it compares with the average adult."""
    if relative < 0.67:
        return "Below average"
    if relative < 1.5:
        return "Average"
    if relative < 3:
        return "Elevated"
    return "High"


class RiskEngine:
    """Loads every saved model once, then scores people."""

    def __init__(self, models_dir: Path = MODELS_DIR):
        manifest = json.loads((models_dir / "manifest.json").read_text())
        self.models = {}
        for key, info in manifest.items():
            bundle = joblib.load(models_dir / Path(info["path"]).name)
            self.models[key] = bundle

    def predict(self, person: PersonInput) -> dict:
        row = to_model_row(person)
        use_full = person.conditions is not None
        if use_full:
            missing = set(CONDITIONS) - set(person.conditions)
            if missing:
                raise ValueError(f"Answer every condition, missing: {sorted(missing)}")
            row.update({k: int(v) for k, v in person.conditions.items()})

        results = []
        for target, label in CONDITIONS.items():
            bundle = self.models[f"{target}_{'full' if use_full else 'lifestyle'}"]
            X = pd.DataFrame([{col: row[col] for col in bundle["input_columns"]}])
            score = float(bundle["pipeline"].predict_proba(X)[0, 1])
            base = bundle["test_metrics"]["base_rate"]
            probability = to_probability(bundle, score)
            relative = probability / base
            results.append({
                "condition": target,
                "label": label,
                "probability": round(probability, 4),
                "average": round(base, 4),
                "relative_risk": round(relative, 2),
                "level": risk_level(relative),
                "flagged": score >= bundle["threshold"],
                "already_has": bool(use_full and person.conditions[target]),
                "model_pr_auc": round(bundle["test_metrics"]["pr_auc"], 3),
            })

        results.sort(key=lambda r: (r["already_has"], -r["relative_risk"]))
        return {
            "model_set": "full" if use_full else "lifestyle",
            "bmi": row["BMI"],
            "results": results,
        }
