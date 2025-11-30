const UNIT_STORAGE_KEY = 'rcm_unit_system';
const UNIT_SYSTEM_METRIC = 'metric';
const UNIT_SYSTEM_IMPERIAL = 'imperial';
const KM_TO_MI = 0.621371;
const M_TO_FT = 3.28084;
const DEFAULT_SYSTEM = UNIT_SYSTEM_IMPERIAL;

class UnitPreferences {
    constructor() {
        this.unitSystem = this.loadPreference();
    }

    loadPreference() {
        if (!window?.localStorage) {
            return DEFAULT_SYSTEM;
        }

        try {
            const stored = window.localStorage.getItem(UNIT_STORAGE_KEY);
            if (stored === UNIT_SYSTEM_METRIC || stored === UNIT_SYSTEM_IMPERIAL) {
                return stored;
            }
        } catch (error) {
            console.warn('⚠️ Unable to read unit preference:', error);
        }

        return DEFAULT_SYSTEM;
    }

    persistPreference(system) {
        if (!window?.localStorage) {
            return;
        }

        try {
            window.localStorage.setItem(UNIT_STORAGE_KEY, system);
        } catch (error) {
            console.warn('⚠️ Unable to persist unit preference:', error);
        }
    }

    getUnitSystem() {
        return this.unitSystem;
    }

    isMetric() {
        return this.unitSystem === UNIT_SYSTEM_METRIC;
    }

    setUnitSystem(system) {
        const normalized = system === UNIT_SYSTEM_IMPERIAL ? UNIT_SYSTEM_IMPERIAL : UNIT_SYSTEM_METRIC;
        if (normalized === this.unitSystem) {
            return this.unitSystem;
        }

        this.unitSystem = normalized;
        this.persistPreference(this.unitSystem);
        this.notifyChange();
        return this.unitSystem;
    }

    toggleUnitSystem() {
        const next = this.isMetric() ? UNIT_SYSTEM_IMPERIAL : UNIT_SYSTEM_METRIC;
        return this.setUnitSystem(next);
    }

    notifyChange() {
        if (typeof window?.dispatchEvent !== 'function') {
            return;
        }

        window.dispatchEvent(new CustomEvent('rcm:unit-change', {
            detail: { system: this.unitSystem }
        }));
    }

    formatDistance(distanceKm, options = {}) {
        const { includeUnit = true, precision } = options;
        const valueKm = Number(distanceKm);
        const safeKm = Number.isFinite(valueKm) ? valueKm : 0;
        const conversionFactor = this.isMetric() ? 1 : KM_TO_MI;
        const converted = safeKm * conversionFactor;
        const decimals = typeof precision === 'number' ? precision : 1;
        const valueStr = converted.toFixed(decimals);
        if (!includeUnit) {
            return valueStr;
        }
        const unit = this.isMetric() ? 'km' : 'mi';
        return `${valueStr}${unit}`;
    }

    formatElevation(elevationMeters, options = {}) {
        const { includeUnit = true, precision } = options;
        const valueMeters = Number(elevationMeters);
        const safeMeters = Number.isFinite(valueMeters) ? valueMeters : 0;
        const conversionFactor = this.isMetric() ? 1 : M_TO_FT;
        const converted = safeMeters * conversionFactor;
        const decimals = typeof precision === 'number' ? precision : 0;
        const valueStr = decimals === 0 ? Math.round(converted).toString() : converted.toFixed(decimals);
        if (!includeUnit) {
            return valueStr;
        }
        const unit = this.isMetric() ? 'm' : 'ft';
        return `${valueStr}${unit}`;
    }

    convertDistance(distanceKm) {
        const valueKm = Number(distanceKm);
        const safeKm = Number.isFinite(valueKm) ? valueKm : 0;
        const conversionFactor = this.isMetric() ? 1 : KM_TO_MI;
        return {
            value: safeKm * conversionFactor,
            unit: this.isMetric() ? 'km' : 'mi',
            system: this.unitSystem
        };
    }

    convertElevation(elevationMeters) {
        const valueMeters = Number(elevationMeters);
        const safeMeters = Number.isFinite(valueMeters) ? valueMeters : 0;
        const conversionFactor = this.isMetric() ? 1 : M_TO_FT;
        return {
            value: safeMeters * conversionFactor,
            unit: this.isMetric() ? 'm' : 'ft',
            system: this.unitSystem
        };
    }
}

const unitPreferences = new UnitPreferences();

export default unitPreferences;
export { UNIT_SYSTEM_METRIC, UNIT_SYSTEM_IMPERIAL };
