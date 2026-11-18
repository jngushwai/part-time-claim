import { useState } from 'react';
import Modal from './ui/Modal';
import { db, collection, addDoc, serverTimestamp } from '../utils/firebase';
import { useToast } from './ui/Toast';

export default function SubmitClaimModal({ isOpen, onClose, onSuccess }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    hours: '',
    department: 'COMPUTER STUDIES'
  });
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await addDoc(collection(db, 'claims'), {
        date: form.date,
        hours: parseFloat(form.hours),
        department: form.department,
        createdAt: serverTimestamp(),
        status: 'Pending'
      });
      toast('Consultation claim submitted successfully to Firestore!');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Error saving claim to Firestore:', err);
      toast('Failed to save claim to Firestore', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Submit Consultation Claim (Firestore)" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Date</label>
          <input
            type="date"
            className="input"
            value={form.date}
            onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            required
          />
        </div>
        <div>
          <label className="label">Hours</label>
          <input
            type="number"
            step="0.5"
            min="0.5"
            max="24"
            className="input"
            placeholder="e.g. 3"
            value={form.hours}
            onChange={e => setForm(f => ({ ...f, hours: e.target.value }))}
            required
          />
        </div>
        <div>
          <label className="label">Department</label>
          <select
            className="input"
            value={form.department}
            onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
          >
            <option value="COMPUTER STUDIES">COMPUTER STUDIES</option>
            <option value="ELECTRICAL ENGINEERING">ELECTRICAL ENGINEERING</option>
            <option value="MECHANICAL ENGINEERING">MECHANICAL ENGINEERING</option>
            <option value="CIVIL ENGINEERING">CIVIL ENGINEERING</option>
            <option value="SCIENCE AND ALLIED STUDIES">SCIENCE AND ALLIED STUDIES</option>
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Saving...' : 'Submit to Firestore'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
