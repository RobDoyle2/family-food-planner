import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { useConfirm, useToast } from '../state/ui';
import { PageHeader } from '../components/common';
import { makeBackup, validateBackup, type ValidationResult } from '../lib/backup';
import { requestPersistence } from '../lib/db';
import { downloadFile, todayKey } from '../lib/util';

export default function SettingsPage() {
  const { data, replaceAllData, resetAll, storageOk, household } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [result, setResult] = useState<(ValidationResult & { fileName: string }) | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string>('');

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
    navigator.storage
      ?.estimate?.()
      .then((e) => e.usage !== undefined && setUsage(`${(e.usage / 1024 / 1024).toFixed(1)} MB used`))
      .catch(() => {});
  }, []);

  const exportJson = async () => {
    const name = (household?.name ?? 'family').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const json = JSON.stringify(makeBackup(data), null, 2);
    const result = await downloadFile(`family-food-planner-${name}-${todayKey()}.json`, json);
    if (result === 'saved') return toast.show('Backup saved');
    if (result === 'declined') return toast.show('Backup not saved', 'info');
    // Saving files isn't possible here: copy the backup so it can be pasted into a note or email instead.
    try {
      await navigator.clipboard.writeText(json);
      toast.show('Saving files isn’t available here, so the backup was copied — paste it into a note or email to keep it.', 'info');
    } catch {
      toast.show('This view can’t save or copy files. Open the app in a normal browser tab to back up.', 'error');
    }
  };

  const onFile = async (file: File) => {
    try {
      const text = await file.text();
      setResult({ ...validateBackup(text), fileName: file.name });
    } catch {
      setResult({ ok: false, errors: ['The file could not be read.'], fileName: file.name });
    }
  };

  const doImport = async () => {
    if (!result?.ok || !result.data) return;
    if (!(await confirm({ title: 'Replace all data with this backup?', message: 'Everything currently stored in this app on this device will be replaced. Consider exporting a backup first.', confirmLabel: 'Replace my data', danger: true }))) return;
    try {
      await replaceAllData(result.data);
      setResult(null);
      toast.show('Backup imported');
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  };

  return (
    <div className="page">
      <PageHeader title="Settings" subtitle="Backups, storage and information about the app." />

      <section className="card" aria-labelledby="backup-h">
        <h2 id="backup-h" className="card-title">
          Back up your data
        </h2>
        <p className="muted">
          Everything is stored privately on this device — there is no account or cloud copy. Download a backup regularly, and use it to move your data to another phone or browser.
        </p>
        <div className="form-actions start">
          <button className="btn btn-primary" onClick={exportJson}>
            ⬇ Export backup (JSON)
          </button>
        </div>
      </section>

      <section className="card" aria-labelledby="import-h">
        <h2 id="import-h" className="card-title">
          Restore from a backup
        </h2>
        <p className="muted">The file is fully checked before anything is changed. Nothing is replaced until you confirm.</p>
        <label className="btn btn-secondary file-btn">
          ⬆ Choose backup file…
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = '';
            }}
          />
        </label>
        {result && (
          <div className={`import-result ${result.ok ? 'ok' : 'bad'}`} role="status">
            <p>
              <strong>{result.fileName}</strong>: {result.ok ? 'this backup is valid.' : 'this file cannot be imported.'}
            </p>
            {result.ok ? (
              <>
                <p>It contains: {result.summary?.join(', ')}.</p>
                <div className="form-actions start">
                  <button className="btn btn-danger" onClick={doImport}>
                    Replace my data with this backup
                  </button>
                  <button className="btn btn-ghost" onClick={() => setResult(null)}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <ul className="error-list">
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="storage-h">
        <h2 id="storage-h" className="card-title">
          Storage
        </h2>
        <p>
          Status: {storageOk ? <span className="badge badge-good">Saving to this device</span> : <span className="badge badge-danger">Not saving — export a backup</span>} {usage && <span className="muted small">{usage}</span>}
        </p>
        <p className="muted">
          {persisted
            ? 'This browser has agreed to keep your data even when space is low.'
            : 'Browsers may clear stored data when space runs low. You can ask this browser to keep it permanently.'}
        </p>
        {!persisted && (
          <button
            className="btn btn-secondary"
            onClick={async () => {
              const r = await requestPersistence();
              setPersisted(!!r);
              toast.show(r ? 'Storage will be kept' : r === null ? 'This browser does not support this option' : 'The browser declined — installing the app usually helps', r ? 'success' : 'info');
            }}
          >
            Keep my data permanently
          </button>
        )}
      </section>

      <section className="card" aria-labelledby="install-h">
        <h2 id="install-h" className="card-title">
          Install on your phone
        </h2>
        <p className="muted">
          Family Food Planner works offline once it has loaded. On Android (Chrome) choose <strong>⋮ → Add to Home screen / Install app</strong>. On iPhone (Safari) tap <strong>Share → Add to Home Screen</strong>.
        </p>
      </section>

      <section className="card" aria-labelledby="about-h">
        <h2 id="about-h" className="card-title">
          About & safety
        </h2>
        <ul className="plain-list bullets">
          <li>Allergies, intolerances, dietary requirements and excluded foods are applied as strict rules — they are never relaxed to fill a plan.</li>
          <li>Allergen information is based on typical ingredients. Products such as sausages, stock cubes, sauces and bread vary by brand — always read the label.</li>
          <li>Foods you add yourself are not treated as allergen-safe until you declare their allergens.</li>
          <li>This app is not a medical or dietetic service. It does not offer weight-loss or calorie-restricted plans for children.</li>
          <li>
            Version {__APP_VERSION__} · {data.recipes.length} recipes · {data.foods.length} foods in the catalogue.
          </li>
        </ul>
      </section>

      <section className="card danger-zone" aria-labelledby="reset-h">
        <h2 id="reset-h" className="card-title">
          Reset the app
        </h2>
        <p className="muted">Deletes your household, family members, preferences, custom foods, meal plans, shopping list and favourites from this device.</p>
        <button
          className="btn btn-danger"
          onClick={async () => {
            if (!(await confirm({ title: 'Reset everything?', message: 'All your data on this device will be permanently deleted. This cannot be undone unless you have a backup.', confirmLabel: 'Delete everything', danger: true }))) return;
            try {
              await resetAll();
              toast.show('The app has been reset');
            } catch (e) {
              toast.show((e as Error).message, 'error');
            }
          }}
        >
          Reset all data
        </button>
      </section>
    </div>
  );
}
