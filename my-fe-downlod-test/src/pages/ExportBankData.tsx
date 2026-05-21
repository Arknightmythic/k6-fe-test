import React, { useState, useEffect } from 'react';
import type { FormEvent } from 'react'; // Perbaikan 1: Gunakan 'type-only import'
import axios from 'axios';

// Konfigurasi instance axios
const api = axios.create({
  baseURL: 'http://localhost:8002/api',
  withCredentials: true,
  headers: {
    Accept: 'application/json',
    Authorization:'Bearer 2|GscRzlrTPs4y2PLzUJoIoeitrlEu9jLiP06W17Dj1315aad6',
  },
});

interface ExportQueueResponse {
  message: string;
  export_job_id: number;
  estimated_rows: number;
}

interface ExportStatusResponse {
  status: 'pending' | 'processing' | 'done' | 'failed';
  download_url: string | null;
}

const ExportBankData: React.FC = () => {
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const [minDate, setMinDate] = useState<string>('');
  const [maxDate, setMaxDate] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');

  useEffect(() => {
    const today = new Date();
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endOfCurrentMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const formatDate = (date: Date): string => {
      let month = '' + (date.getMonth() + 1);
      let day = '' + date.getDate();
      const year = date.getFullYear();

      if (month.length < 2) month = '0' + month;
      if (day.length < 2) day = '0' + day;

      return [year, month, day].join('-');
    };

    const formattedMin = formatDate(startOfLastMonth);
    const formattedMax = formatDate(endOfCurrentMonth);

    setMinDate(formattedMin);
    setMaxDate(formattedMax);

    setDateFrom(formattedMin);
    setDateTo(formattedMax);
  }, []);

  const triggerDownload = (blob: Blob, filename: string): void => {
    const url = window.URL.createObjectURL(new Blob([blob]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.parentNode?.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleExport = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setIsLoading(true);
    setStatusMessage('Memulai export...');

    try {
      const response = await api.get('/bank-data/export', {
        params: { date_from: dateFrom, date_to: dateTo },
        responseType: 'blob',
      });

      const contentType = response.headers['content-type'];

      // Perbaikan 2: Pastikan typeof contentType adalah string sebelum memanggil .includes()
      if (typeof contentType === 'string' && contentType.includes('application/json')) {
        const textData = await (response.data as Blob).text();
        const jsonData: ExportQueueResponse = JSON.parse(textData);

        setStatusMessage(jsonData.message || 'Export masuk antrean. Menunggu proses...');
        pollExportStatus(jsonData.export_job_id);
      } else {
        setStatusMessage('File siap diunduh.');

        const contentDisposition = response.headers['content-disposition'];
        let filename = 'bank_data_export.csv';
        
        // Perbaikan 2 (tambahan): Pastikan typeof contentDisposition adalah string juga
        if (typeof contentDisposition === 'string' && contentDisposition.includes('attachment')) {
          const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
          const matches = filenameRegex.exec(contentDisposition);
          if (matches != null && matches[1]) {
            filename = matches[1].replace(/['"]/g, '');
          }
        }

        triggerDownload(response.data as Blob, filename);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Export gagal:', error);
      setStatusMessage('Terjadi kesalahan saat memulai export.');
      setIsLoading(false);
    }
  };

  const pollExportStatus = async (jobId: number): Promise<void> => {
    try {
      const response = await api.get<ExportStatusResponse>(`/bank-data/export/${jobId}/status`);
      const { status, download_url } = response.data;

      if (status === 'done' && download_url) {
        setStatusMessage('Export selesai. Mengunduh file...');
        await downloadQueuedFile(download_url);
      } else if (status === 'failed') {
        setStatusMessage('Proses export di background gagal.');
        setIsLoading(false);
      } else {
        setTimeout(() => pollExportStatus(jobId), 3000);
      }
    } catch (error) {
      console.error('Gagal mengecek status:', error);
      setStatusMessage('Gagal mengecek status export.');
      setIsLoading(false);
    }
  };

  const downloadQueuedFile = async (downloadUrl: string): Promise<void> => {
    try {
      const response = await api.get(downloadUrl, {
        responseType: 'blob',
      });

      const filename = `bank_data_queued_${new Date().getTime()}.csv`;

      triggerDownload(response.data as Blob, filename);
      setStatusMessage('Download berhasil.');
    } catch (error) {
      console.error('Gagal mengunduh file:', error);
      setStatusMessage('Gagal mengunduh file hasil export.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto bg-white rounded-xl shadow-md space-y-4">
      <h2 className="text-xl font-bold">Export Bank Data</h2>

      <form onSubmit={handleExport} className="space-y-4">
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700">Dari Tanggal</label>
          <input
            type="date"
            value={dateFrom}
            min={minDate}
            max={maxDate}
            onChange={(e) => setDateFrom(e.target.value)}
            className="mt-1 p-2 border rounded"
            required
          />
        </div>

        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700">Sampai Tanggal</label>
          <input
            type="date"
            value={dateTo}
            min={minDate}
            max={maxDate}
            onChange={(e) => setDateTo(e.target.value)}
            className="mt-1 p-2 border rounded"
            required
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          {isLoading ? 'Memproses...' : 'Export & Download'}
        </button>
      </form>

      {statusMessage && (
        <div className="text-sm text-gray-600 mt-2">Status: {statusMessage}</div>
      )}
    </div>
  );
};

export default ExportBankData;