import { useViewportStore } from "../state/store";
import type { BoolOp, Feature } from "../features";

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
  const addFeaturePattern = useViewportStore((s) => s.addFeaturePattern);
  const addFeatureMirror = useViewportStore((s) => s.addFeatureMirror);
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

      {feature?.type === "import" && (
        <div className="pm-section">
          <div className="pm-heading">{feature.name}</div>
          <div className="pm-instruction">Khối nhập từ {feature.format.toUpperCase()}. Vẽ tiếp lên bằng Sketch → Extrude/Cut hoặc lệnh AI.</div>
          <label className="pm-option">
            Kết hợp
            <select value={feature.operation} disabled={busy} onChange={(e) => update(feature.id, { operation: e.target.value as BoolOp })}>
              <option value="new">Khối riêng</option>
              <option value="add">Cộng (fuse)</option>
              <option value="cut">Trừ (cut)</option>
            </select>
          </label>
          <DeleteBtn onClick={() => del(feature.id)} />
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
          <label className="pm-option">
            <input type="checkbox" checked={!!feature.flip} disabled={busy || !!feature.midplane} onChange={(e) => update(feature.id, { flip: e.target.checked })} />
            <span>Đảo chiều</span>
          </label>
          <label className="pm-option">
            <input type="checkbox" checked={!!feature.midplane} disabled={busy} onChange={(e) => update(feature.id, { midplane: e.target.checked })} />
            <span>Mid Plane (đối xứng)</span>
          </label>
          <OpSelect value={feature.operation} onChange={(operation) => update(feature.id, { operation })} disabled={busy} />
          <PatternBtns id={feature.id} add={addFeaturePattern} mirror={addFeatureMirror} />
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
          <PatternBtns id={feature.id} add={addFeaturePattern} mirror={addFeatureMirror} />
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

      {feature?.type === "refPlane" && (
        <div className="pm-section">
          <div className="pm-heading">{feature.name}</div>
          <div className="pm-instruction">Mặt phẳng tham chiếu. Vào Sketch rồi chọn mặt phẳng này để vẽ trên đó.</div>
          <label className="pm-option">
            Song song với
            <select value={feature.base} disabled={busy} onChange={(e) => update(feature.id, { base: e.target.value })}>
              <option value="front">Front</option>
              <option value="top">Top</option>
              <option value="right">Right</option>
            </select>
          </label>
          <label className="pm-option">
            Offset (mm)
            <input type="number" value={feature.offset} disabled={busy} onChange={(e) => update(feature.id, { offset: parseFloat(e.target.value) || 0 })} />
          </label>
          <DeleteBtn onClick={() => del(feature.id)} />
        </div>
      )}

      {feature?.type === "mirrorBody" && (
        <div className="pm-section">
          <div className="pm-heading">{feature.name}</div>
          <div className="pm-instruction">Soi gương khối qua mặt phẳng.</div>
          <MirrorPlaneSelect value={feature.plane} features={features} disabled={busy} onChange={(plane) => update(feature.id, { plane })} />
          <label className="pm-option">
            <input type="checkbox" checked={feature.merge !== false} disabled={busy} onChange={(e) => update(feature.id, { merge: e.target.checked })} />
            <span>Gộp khối (Merge solids) — bỏ chọn để tạo khối riêng (đối xứng tay trái/phải)</span>
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

      {feature?.type === "featPatternLinear" && (
        <div className="pm-section">
          <div className="pm-heading">{feature.name}</div>
          <div className="pm-instruction">Lặp feature gốc thành dãy thẳng.</div>
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

      {feature?.type === "featPatternCircular" && (
        <div className="pm-section">
          <div className="pm-heading">{feature.name}</div>
          <div className="pm-instruction">Lặp feature gốc quanh trục qua gốc toạ độ.</div>
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

      {feature?.type === "featMirror" && (
        <div className="pm-section">
          <div className="pm-heading">{feature.name}</div>
          <div className="pm-instruction">Soi gương feature gốc qua mặt phẳng.</div>
          <MirrorPlaneSelect value={feature.plane} features={features} disabled={busy} onChange={(plane) => update(feature.id, { plane })} />
          <DeleteBtn onClick={() => del(feature.id)} />
        </div>
      )}

      {feature?.type === "thread" && (
        <div className="pm-section">
          <div className="pm-heading">{feature.name}</div>
          <div className="pm-instruction">Ren xoắn ngoài (helix thật) — là một khối riêng (multi-body). Ren trong (lỗ taro) chưa hỗ trợ.</div>
          <label className="pm-option">Đường kính (mm)
            <input type="number" value={feature.diameter} disabled={busy} onChange={(e) => update(feature.id, { diameter: parseFloat(e.target.value) || 0 })} />
          </label>
          <label className="pm-option">Bước ren / pitch (mm)
            <input type="number" step="0.1" value={feature.pitch} disabled={busy} onChange={(e) => update(feature.id, { pitch: parseFloat(e.target.value) || 0 })} />
          </label>
          <label className="pm-option">Chiều dài ren (mm)
            <input type="number" value={feature.length} disabled={busy} onChange={(e) => update(feature.id, { length: parseFloat(e.target.value) || 0 })} />
          </label>
          <div className="pm-relations" style={{ gap: 8 }}>
            <label className="pm-option" style={{ flex: 1 }}>X
              <input type="number" value={feature.x} disabled={busy} onChange={(e) => update(feature.id, { x: parseFloat(e.target.value) || 0 })} />
            </label>
            <label className="pm-option" style={{ flex: 1 }}>Y
              <input type="number" value={feature.y} disabled={busy} onChange={(e) => update(feature.id, { y: parseFloat(e.target.value) || 0 })} />
            </label>
            <label className="pm-option" style={{ flex: 1 }}>Z
              <input type="number" value={feature.z} disabled={busy} onChange={(e) => update(feature.id, { z: parseFloat(e.target.value) || 0 })} />
            </label>
          </div>
          <label className="pm-option">Trục ren
            <select value={feature.axis} disabled={busy} onChange={(e) => update(feature.id, { axis: e.target.value as "x" | "y" | "z" })}>
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

/** Mirror-about-plane picker: 3 standard planes + any datum planes in the tree. */
function MirrorPlaneSelect({
  value,
  features,
  disabled,
  onChange,
}: {
  value: string;
  features: Feature[];
  disabled?: boolean;
  onChange: (plane: string) => void;
}) {
  const datums = features.filter((f) => f.type === "refPlane");
  return (
    <label className="pm-option">
      Mặt phẳng
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="YZ">YZ (trái–phải)</option>
        <option value="XZ">XZ (trước–sau)</option>
        <option value="XY">XY (trên–dưới)</option>
        {datums.length > 0 && (
          <optgroup label="Datum plane">
            {datums.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  );
}

function PatternBtns({
  id,
  add,
  mirror,
}: {
  id: string;
  add: (kind: "featPatternLinear" | "featPatternCircular", targetId: string) => void;
  mirror: (targetId: string) => void;
}) {
  return (
    <div className="pm-relations">
      <button className="pm-rel-btn" onClick={() => add("featPatternLinear", id)} title="Lặp feature này thành dãy thẳng">▦ Pattern thẳng</button>
      <button className="pm-rel-btn" onClick={() => add("featPatternCircular", id)} title="Lặp feature này quanh trục">🔄 Pattern tròn</button>
      <button className="pm-rel-btn" onClick={() => mirror(id)} title="Soi gương feature này qua mặt phẳng">🪞 Mirror</button>
    </div>
  );
}

function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <div className="pm-relations">
      <button className="pm-rel-btn" onClick={onClick}>🗑 Xoá feature</button>
    </div>
  );
}
