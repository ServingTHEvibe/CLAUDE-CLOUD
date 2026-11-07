import { photoSource } from "../lib/field-store";
import type { Asset } from "../lib/asset";
export default function EquipmentInfo({ asset }: { asset: Asset }) {
  const fields = [
    ["Equipment type", asset.equipmentType || asset.category],
    ["Status", asset.status],
    ["Business", asset.site],
    ["Address", asset.address],
    ["Asset tag", asset.tag],
    ["Model", asset.model],
    ["Serial number", asset.serial],
    ["Floor", asset.floor],
    ["Room / exact position", asset.room],
    ["Saved coordinates", asset.lat.toFixed(7) + ", " + asset.lng.toFixed(7)],
  ];
  return (
    <article className="equipment-info" aria-label={"Info sheet for " + asset.name}>
      <p className="eyebrow">EQUIPMENT INFO SHEET</p>
      <h3>{asset.name}</h3>
      <dl>
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value || "Not recorded"}</dd>
          </div>
        ))}
      </dl>
      <h4>Notes</h4>
      <p className="note-text">{asset.notes || "No equipment notes yet."}</p>
      {asset.parking && (
        <>
          <h4>Parking</h4>
          <p>{asset.parking}</p>
        </>
      )}
      {asset.entrance && (
        <>
          <h4>Entrance & route</h4>
          <p>{asset.entrance}</p>
        </>
      )}
      {asset.photos.length > 0 && (
        <div className="pin-info-photos">
          {asset.photos.map((p) => (
            <figure key={p.label}>
              <a href={photoSource(p.key)} target="_blank" rel="noopener noreferrer">
                <img src={photoSource(p.key)} alt={p.label + " photo for " + asset.name} />
              </a>
              <figcaption>{p.label}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {asset.history.length > 0 && (
        <>
          <h4>Service history</h4>
          {asset.history.slice(0, 10).map((h) => (
            <div className="pin-info-history" key={h.id}>
              <small>{new Date(h.date).toLocaleDateString()}</small>
              <p>{h.text}</p>
            </div>
          ))}
        </>
      )}
      <small className="pin-info-id">Record ID: {asset.id}</small>
    </article>
  );
}
