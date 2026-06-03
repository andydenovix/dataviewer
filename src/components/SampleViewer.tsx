"use client";

import React, { useState } from 'react';
import { LabSample } from '../types';
import { X, ChevronLeft, ChevronRight, Copy, Check, Upload, Loader2 } from 'lucide-react';
import { BRAND_COLOR } from '@/lib/constants';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';

export interface SampleViewerProps {
  sample: LabSample;
  onClose: () => void;
}

type ImageType = 'bf' | 'red' | 'green' | 'result';

const IMAGE_TYPE_LABELS: Record<ImageType, { label: string; description: string; color: string }> = {
  bf: { label: 'Brightfield', description: 'BF - Structural overview', color: 'slate' },
  red: { label: 'Red (PI)', description: 'Red channel - Propidium Iodide (Dead cells)', color: 'red' },
  green: { label: 'Green (AO)', description: 'Green channel - Acridine Orange (Live cells)', color: 'green' },
  result: { label: 'Result', description: 'Overlay of BF, Red, and Green', color: 'indigo' },
};

export const SampleViewer: React.FC<SampleViewerProps> = ({ sample, onClose }) => {
  const [activeImageType, setActiveImageType] = useState<ImageType>('bf');
  const [copiedMetaKey, setCopiedMetaKey] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !sample.id) return;

    setIsUploading(true);
    try {
      const storageRef = ref(storage, `samples/${sample.id}/${activeImageType}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(snapshot.ref);

      const sampleRef = doc(db, 'samples', sample.id);
      await updateDoc(sampleRef, {
        [`images.${activeImageType}`]: downloadUrl
      });
    } catch (error) {
      console.error("Error uploading image:", error);
      alert("Failed to upload image.");
    } finally {
      setIsUploading(false);
    }
  };

  const imageUrls = sample.images || {};
  const currentImageUrl = imageUrls[activeImageType];
  const cellCountData = sample.metadata?.cellCountData;
  const protocolName = sample.metadata?.protocolName;

  const imageTypes: ImageType[] = ['bf', 'red', 'green', 'result'];
  const availableImageTypes = imageTypes.filter(type => imageUrls[type]);

  const handleCopyMeta = (key: string, value: any) => {
    const text = `${key}: ${JSON.stringify(value)}`;
    navigator.clipboard.writeText(text);
    setCopiedMetaKey(key);
    setTimeout(() => setCopiedMetaKey(null), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl max-w-6xl w-full my-8">
        {/* Header */}
        <div className="border-b border-slate-200 p-6 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{sample.sampleName}</h2>
            <p className="text-sm text-slate-500 mt-1">
              {sample.sampleType === 'cell-count' ? 'Cell Counting Analysis' : 'Sample Analysis'}
              {protocolName && ` • Protocol: ${protocolName}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-slate-600" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
          {/* Image Viewer */}
          <div className="lg:col-span-2">
            <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
              {/* Image Display */}
              <div className="aspect-video bg-slate-900 flex items-center justify-center">
                {currentImageUrl ? (
                  <img
                    src={currentImageUrl}
                    alt={`${sample.sampleName} - ${IMAGE_TYPE_LABELS[activeImageType].label}`}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-slate-800/50 transition-colors group p-8">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      {isUploading ? (
                        <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
                      ) : (
                        <Upload className="w-10 h-10 text-slate-500 group-hover:text-blue-400 transition-colors" />
                      )}
                      <div className="text-slate-400 text-center">
                        <p className="text-sm font-medium">{isUploading ? 'Uploading...' : 'No image available'}</p>
                        <p className="text-xs mt-1">Click to upload {IMAGE_TYPE_LABELS[activeImageType].label} channel</p>
                      </div>
                    </div>
                    <input 
                      type="file" 
                      className="hidden" 
                      accept="image/*" 
                      onChange={handleImageUpload}
                      disabled={isUploading}
                    />
                  </label>
                )}
              </div>

              {/* Image Type Selector */}
              <div className="p-4 border-t border-slate-200 bg-white">
                <p className="text-xs font-semibold text-slate-500 uppercase mb-3">View Type</p>
                <div className="grid grid-cols-4 gap-2">
                  {imageTypes.map((type) => {
                    const isAvailable = imageUrls[type];
                    const isActive = activeImageType === type;
                    const config = IMAGE_TYPE_LABELS[type];

                    return (
                      <button
                        key={type}
                        onClick={() => setActiveImageType(type)}
                        className={`p-3 rounded-lg border-2 transition-all text-center ${ 
                          isActive
                            ? `bg-blue-50/50 shadow-sm ring-2 ring-inset ring-blue-500/20`
                            : isAvailable
                            ? 'border-slate-200 hover:border-slate-300 bg-white'
                            : 'border-slate-100 bg-slate-50 cursor-not-allowed opacity-50'
                        }`}
                        style={isActive ? { borderColor: BRAND_COLOR, backgroundColor: `${BRAND_COLOR}10` } : undefined}
                      >
                        <div className="text-xs font-bold text-slate-900">{config.label}</div>
                        <div className="text-[10px] text-slate-500 mt-1">{type.toUpperCase()}</div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-600 mt-3">
                  {IMAGE_TYPE_LABELS[activeImageType].description}
                </p>
              </div>
            </div>
          </div>

          {/* Metadata & Cell Count Panel */}
          <div className="space-y-6">
            {/* Cell Count Data */}
            {cellCountData && (
              <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
                <h3 className="font-bold text-slate-900 mb-3">Cell Count Data</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total Cells:</span>
                    <span className="font-mono font-bold text-slate-900">
                      {cellCountData.totalCells.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-emerald-700">Live Cells:</span>
                    <span className="font-mono font-bold text-emerald-700">
                      {cellCountData.liveCells.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-700">Dead Cells:</span>
                    <span className="font-mono font-bold text-red-700">
                      {cellCountData.deadCells.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-emerald-200 pt-2 mt-2">
                    <span className="text-slate-600">Viability:</span>
                    <span className="font-mono font-bold text-emerald-600">
                      {cellCountData.viability.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Sample Metadata */}
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
              <h3 className="font-bold text-slate-900 mb-3">Metadata</h3>
              <div className="space-y-2 text-xs max-h-96 overflow-y-auto">
                {sample.metadata ? (
                  Object.entries(sample.metadata)
                    .filter(([key]) => {
                      // Hide internal/computed fields
                      const hidden = [
                        'replicateStats', 'cellCountData', 'imageMetadata', 'Protocol',
                        'Live Cells/mL', 'Dead Cells/mL', 'Total Cells/mL', '% Viability',
                        'Live Cell Count', 'Dead Cell Count', 'Total Cell Count', 'Viability'
                      ];
                      const isDiameter = key.toLowerCase().includes('cells') && key.toLowerCase().includes('um');
                      return !hidden.includes(key) && !isDiameter;
                    })
                    .map(([key, value]) => {
                      if (value === undefined || value === null || (typeof value === 'object' && Object.keys(value).length === 0)) {
                        return null;
                      }

                      const displayValue =
                        typeof value === 'object' ? JSON.stringify(value) : String(value);
                      const isCopied = copiedMetaKey === key;

                      return (
                        <button
                          key={key}
                          onClick={() => handleCopyMeta(key, value)}
                          className="w-full text-left p-2 rounded hover:bg-slate-200 transition-colors group"
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex-1">
                              <div className="font-semibold text-slate-700">{key}</div>
                              <div className="text-slate-600 truncate">{displayValue}</div>
                            </div>
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                              {isCopied ? (
                                <Check className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <Copy className="w-4 h-4 text-slate-400" />
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })
                    .filter(Boolean)
                ) : (
                  <p className="text-slate-500">No metadata available</p>
                )}
              </div>
            </div>

            {/* Sample Info */}
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 text-xs">
              <div className="space-y-2">
                <div>
                  <div className="font-semibold text-slate-700">Type</div>
                  <div className="text-slate-600">{sample.sampleType}</div>
                </div>
                <div>
                  <div className="font-semibold text-slate-700">Application</div>
                  <div className="text-slate-600">{sample.application || 'N/A'}</div>
                </div>
                <div>
                  <div className="font-semibold text-slate-700">Measured</div>
                  <div className="text-slate-600">
                    {new Date(
                      sample.measuredAt instanceof Date
                        ? sample.measuredAt
                        : (sample.measuredAt as any).seconds * 1000
                    ).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Image Gallery */}
        {availableImageTypes.length > 0 && (
          <div className="border-t border-slate-200 bg-slate-50 p-6">
            <h3 className="font-bold text-slate-900 mb-4">Available Images</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {availableImageTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => setActiveImageType(type)}
                  className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all hover:opacity-100 ${
                    activeImageType === type ? 'border-blue-500' : 'border-slate-300 opacity-75'
                  }`}
                >
                  <img
                    src={imageUrls[type]!}
                    alt={IMAGE_TYPE_LABELS[type].label}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-20 transition-colors flex items-end">
                    <div className="w-full bg-gradient-to-t from-black to-transparent text-white p-2 text-xs font-semibold">
                      {IMAGE_TYPE_LABELS[type].label}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
