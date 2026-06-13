import { useViewportStore } from "../state/store";

/** Right panel (model mode): inspect/edit the selected feature; rebuilds live. */
export function FeatureEditor() {
  const mode = useViewportStore((s) => s.mode);
  const features = useViewportStore((s) => s.features);
  const selectedId = useViewportStore((s) => s.selectedFeatureId);
  const update = useViewportStore((s) => s.updateFeature);
  const del = useViewportStore((s) => s.deleteFeature);
  const editSketch = useViewportStore((s) => s.editSketch);
  const openExtrude = useViewportStore((s) => s.openExtrude);
  const openRevolve = useViewportStore((s) => s.openRevolve);
  const busy = useViewportStore((s) => s.busy);

  if (mode !== "model") return null;
  const feature = features.find((f) => f.id === selectedId);

  return (
    <aside className="params-panel">
      <div className="panel-title">Thuộc tính Feature</div>
      {!feature && <div className="params-empty">Chọn một feature trong cây để xem / sửa.</div>}

      {feature?.type === "sketch" && (
        <div className="pm-section">
          <div className="pm-heading">{feature.name}</div>
          <div className="pm-instruction">Sketch 2D. Tạo khối từ sketch này:</div>
          <div className="pm-relations">
            <button className="pm-rel-btn" onClick={() => editSketch(feature.id)}>✏️ Sửa Sketch</button>
            <button className="pm-rel-btn" onClick={() => openExtrude(feature.id)}>⬆️ Đùn</button>
            <button className="pm-rel-btn" onClick={() => openRevolve(feature.id)}>🔄 Xoay</button>
            <button className="pm-rel-btn" onClick={() => del(feature.id)}>🗑 Xoá</button>
          </div>
        </div>
      )}

      {feature?.type === "extrude" && (
        <div className="pm-section">
          <div className="pm-heading">{feature.name}</div>
          <label className="pm-option">
            Chiều cao
            <input
              type="number"
              value={feature.distance}
              disabled={busy}
              onChange={(e) => update(feature.id, { distance: parseFloat(e.target.value) || 0 })}
            />
          </label>
          <OpSelect value={feature.operation} onChange={(operation) => update(feature.id, { operation })} disabled={busy} />
          <DeleteBtn onClick={() => del(feature.id)} />
        </div>
      )}

      {feature?.type === "revolve" && (
        <div className="pm-section">
          <div className="pm-heading">{feature.name}</div>
          <label className="pm-option">
            Góc (độ)
            <input
              type="number"
              value={feature.angle}
              disabled={busy}
              onChange={(e) => update(feature.id, { angle: parseFloat(e.target.value) || 0 })}
            />
          </label>
          <label className="pm-option">
            Trục
            <select value={feature.axis} disabled={busy} onChange={(e) => update(feature.id, { axis: e.target.value as "u" | "v" })}>
              <option value="v">Dọc</option>
              <option value="u">Ngang</option>
            </select>
          </label>
          <OpSelect value={feature.operation} onChange={(operation) => update(feature.id, { operation })} disabled={busy} />
          <DeleteBtn onClick={() => del(feature.id)} />
        </div>
      )}

      {feature?.type === "loft" && (
        <div className="pm-section">
          <div className="pm-heading">{feature.name}</div>
          <div className="pm-instruction">Loft nối {feature.sketchIds.length} sketch.</div>
          <OpSelect value={feature.operation} onChange={(operation) => update(feature.id, { operation })} disabled={busy} />
          <DeleteBtn onClick={() => del(feature.id)} />
        </div>
      )}

      {feature?.type === "sweep" && (
        <div className="pm-section">
          <div className="pm-heading">{feature.name}</div>
          <div className="pm-instruction">Quét biên dạng theo đường dẫn.</div>
          <OpSelect value={feature.operation} onChange={(operation) => update(feature.id, { operation })} disabled={busy} />
          <DeleteBtn onClick={() => del(feature.id)} />
        </div>
      )}

      {(feature?.type === "fillet" || feature?.type === "chamfer") && (
        <div className="pm-section">
          <div className="pm-heading">{feature.name}</div>
          <div className="pm-instruction">{feature.type === "fillet" ? "Bo tròn" : "Vát"} tất cả cạnh của khối.</div>
          <label className="pm-option">
            Bán kính
            <input
              type="number"
              value={feature.radius}
              disabled={busy}
              onChange={(e) => update(feature.id, { radius: parseFloat(e.target.value) || 0 })}
            />
          </label>
          <DeleteBtn onClick={() => del(feature.id)} />
        </div>
      )}

      {feature?.type === "mirrorBody" && (
        <div className="pm-section">
          <div className="pm-heading">{feature.name}</div>
          <div className="pm-instruction">Soi gương khối qua mặt phẳng rồi nối lại.</div>
          <label className="pm-option">
            Mặt phẳng
            <select value={feature.plane} disabled={busy} onChange={(e) => update(feature.id, { plane: e.target.value })}>
              <option value="YZ">YZ (trái–phải)</option>
              <option value="XZ">XZ (trước–sau)</option>
              <option value="XY">XY (trên–dưới)</option>
            </select>
          </label>
          <DeleteBtn onClick={() => del(feature.id)} />
        </div>
      )}

      {feature?.type === "patternLinear" && (
        <div className="pm-section">
          <div className="pm-heading">{feature.name}</div>
          <div className="pm-instruction">Sao chép khối thành dãy thẳng.</div>
          <label className="pm-option">Số lượng
            <input type="number" min={2} value={feature.count} disabled={busy} onChange={(e) => update(feature.id, { count: parseInt(e.target.value) || 2 })} />
          </label>
          <label className="pm-option">Bước X
            <input type="number" value={feature.dx} disabled={busy} onChange={(e) => update(feature.id, { dx: parseFloat(e.target.value) || 0 })} />
          </label>
          <label className="pm-option">Bước Y
            <input type="number" value={feature.dy} disabled={busy} onChange={(e) => update(feature.id, { dy: parseFloat(e.target.value) || 0 })} />
          </label>
          <label className="pm-option">Bước Z
            <input type="number" value={feature.dz} disabled={busy} onChange={(e) => update(feature.id, { dz: parseFloat(e.target.value) || 0 })} />
          </label>
          <DeleteBtn onClick={() => del(feature.id)} />
        </div>
      )}

      {feature?.type === "patternCircular" && (
        <div className="pm-section">
          <div className="pm-heading">{feature.name}</div>
          <div className="pm-instruction">Sao chép khối quanh trục qua gốc toạ độ.</div>
          <label className="pm-option">Số lượng
            <input type="number" min={2} value={feature.count} disabled={busy} onChange={(e) => update(feature.id, { count: parseInt(e.target.value) || 2 })} />
          </label>
          <label className="pm-option">Tổng góc (độ)
            <input type="number" value={feature.angle} disabled={busy} onChange={(e) => update(feature.id, { angle: parseFloat(e.target.value) || 0 })} />
          </label>
          <label className="pm-option">Trục
            <select value={feature.axis} disabled={busy} onChange={(e) => update(feature.id, { axis: e.target.value })}>
              <option value="z">Z (đứng)</option>
              <option value="y">Y</option>
              <option value="x">X</option>
            </select>
          </label>
          <DeleteBtn onClick={() => del(feature.id)} />
        </div>
      )}

      <div className="params-hint">Sửa số → khối tự dựng lại (parametric rebuild theo cây).</div>
    </aside>
  );
}

function OpSelect({ value, onChange, disabled }: { value: string; onChange: (op: "new" | "add" | "cut") => void; disabled?: boolean }) {
  return (
    <label className="pm-option">
      Thao tác
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as "new" | "add" | "cut")}>
        <option value="new">Khối mới</option>
        <option value="add">Thêm</option>
        <option value="cut">Cắt</option>
      </select>
    </label>
  );
}

function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <div className="pm-relations">
      <button className="pm-rel-btn" onClick={onClick}>🗑 Xoá feature</button>
    </div>
  );
}
