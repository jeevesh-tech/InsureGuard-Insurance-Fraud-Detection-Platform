import { useRef, useState } from 'react';
import { FileText, ImagePlus, UploadCloud, X } from 'lucide-react';
import { formatBytes } from '../utils/format';
import { MAX_FILES, validateFiles } from '../utils/validation';

export default function FileDropzone({ files, onChange }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const [errors, setErrors] = useState([]);

  const add = (list) => {
    const { accepted, errors: errs } = validateFiles(files, Array.from(list));
    setErrors(errs);
    if (accepted.length) onChange([...files, ...accepted]);
  };

  return (
    <div>
      <div
        className={`dropzone ${over ? 'over' : ''}`}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        role="button"
        tabIndex={0}
      >
        <UploadCloud size={30} />
        <b>Drop accident photos or PDFs here</b>
        <span>or click to browse · JPG, PNG, WebP, PDF · up to 10 MB each · max {MAX_FILES} files</span>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(e) => { add(e.target.files); e.target.value = ''; }}
        />
      </div>

      {errors.length > 0 && (
        <ul className="field-errors">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
      )}

      {files.length > 0 && (
        <ul className="file-list">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              {f.type === 'application/pdf' ? <FileText size={18} /> : <ImagePlus size={18} />}
              <span className="file-name">{f.name}</span>
              <small>{formatBytes(f.size)}</small>
              <button type="button" className="icon-btn" aria-label={`Remove ${f.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))}>
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
