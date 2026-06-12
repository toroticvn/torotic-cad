import { useViewportStore } from "../state/store";

/**
 * The "Equations" panel: lists every dimension with an editable value and an
 * optional formula referencing other dimensions (e.g. d2 = "d1/2 + 5").
 * Editing anything re-solves the sketch immediately.
 */
export function ParametersPanel() {
  const mode = useViewportStore((s) => s.mode);
  const sketch = useViewportStore((s) => s.sketch);
  useViewportStore((s) => s.sketchVersion); // re-render on solve
  const dimErrors = useViewportStore((s) => s.dimErrors);
  const update = useViewportStore((s) => s.updateDimension);
  const remove = useViewportStore((s) => s.deleteDimension);

  if (mode !== "sketch" || !sketch) return null;
  const dims = sketch.dimensions;

  return (
    <aside className="params-panel">
      <div className="panel-title">Kích thước & Công thức</div>
      {dims.length === 0 && <div className="params-empty">Dùng công cụ 📏 để thêm kích thước.</div>}
      {dims.length > 0 && (
        <table className="params-table">
          <thead>
            <tr>
              <th>Tên</th>
              <th>Giá trị</th>
              <th>Công thức</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {dims.map((d) => {
              const hasFormula = !!d.formula && d.formula.trim() !== "";
              const err = dimErrors[d.id];
              return (
                <tr key={d.id} className={err ? "err" : ""}>
                  <td className="dim-name">{d.name}</td>
                  <td>
                    <input
                      type="number"
                      value={Math.round(d.value * 100) / 100}
                      disabled={hasFormula}
                      onChange={(e) => update(d.id, { value: parseFloat(e.target.value) || 0 })}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      placeholder="vd: d1/2 + 5"
                      value={d.formula ?? ""}
                      onChange={(e) => update(d.id, { formula: e.target.value })}
                      title={err ?? ""}
                    />
                  </td>
                  <td>
                    <button className="dim-del" onClick={() => remove(d.id)} title="Xoá kích thước">
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="params-hint">
        Để liên kết: gõ công thức tham chiếu tên kích thước khác (d1, d2…). Sửa số → hình tự cập nhật.
      </div>
    </aside>
  );
}
