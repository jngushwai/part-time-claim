import { useEffect } from 'react';
import Modal from './ui/Modal';

export default function PdfPreviewModal({ pdf, onClose }) {
  useEffect(() => {
    return () => {
      if (pdf?.url) URL.revokeObjectURL(pdf.url);
    };
  }, [pdf?.url]);

  if (!pdf) return null;

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = pdf.url;
    a.setAttribute('download', pdf.name || 'attendance.pdf');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Modal title={`Attendance Sheet — ${pdf.name || 'PDF'}`} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
          <span className="truncate">{pdf.subtitle || pdf.name}</span>
          <button type="button" onClick={handleDownload} className="btn-primary text-xs whitespace-nowrap">
            ⬇ Download PDF
          </button>
        </div>
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-100 h-[65vh]">
          <iframe
            src={pdf.url}
            title={pdf.name || 'Attendance PDF'}
            className="w-full h-full"
          />
        </div>
      </div>
    </Modal>
  );
}
