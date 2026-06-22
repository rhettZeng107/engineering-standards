// 统一附件上传组件 — 支持点击或拖拽上传
// 视觉/交互移植自 SYSV2 MDM VUpload（Dragger + 文件卡片 + 图片缩略图）；
// 上传机制照搬 HC 现状（antd action 直传 / defer·base64 交父组件，无手动 token 注入，ExtendDoc 不强制鉴权）。
// 契约见 docs/superpowers/specs/2026-06-01-hc-upload-component-unify/contract-lock-uploader.md
import { useState, useEffect, useRef } from 'react';
import { Upload, App, Image } from 'antd';
import { InboxOutlined, UploadOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import './FileUploader.css';

// ExtendDoc 独立文档服务地址（HC 现状直传，无 token）
const EXDOC = process.env.REACT_APP_EXDOC;
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];

// 判断文件名是否图片类（驱动缩略图渲染）
const isImage = (name = '') => IMAGE_EXT.includes((name.split('.').pop() || '').toLowerCase());

// 文件转 base64（base64 数据流模式用，去 data:*/*;base64, 前缀）
const toBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result + '').split(',')[1]);
    reader.onerror = reject;
  });

// ExtendDoc 下载/预览地址
const downloadUrlOf = (item) =>
  item.url || (item.fileId ? `${EXDOC}ExtendDoc/Download/${item.fileId}` : item._localUrl || null);

// 单个文件卡片（类型彩标 / 图片缩略图 + 下载预览 + 删除）
function FileCard({ item, onRemove, enableImagePreview, disabled }) {
  const ext = ((item.name || '').split('.').pop() || '').toUpperCase().slice(0, 4);
  const url = downloadUrlOf(item);
  const showThumb = enableImagePreview && isImage(item.name) && url;
  return (
    <div className="fup__file">
      {showThumb ? (
        <Image src={url} className="fup__file-thumb" width={38} height={38} />
      ) : (
        <span className="fup__file-ft">{ext}</span>
      )}
      <div className="fup__file-meta">
        <b title={item.name}>{item.name}</b>
        {item.status === 'uploading' && <small className="fup__uploading">上传中…</small>}
        {item.status === 'error' && <small className="fup__error">上传失败</small>}
      </div>
      <div className="fup__file-acts">
        {url && !showThumb && (
          <a className="fup__act-btn" href={url} target="_blank" rel="noreferrer" title="下载/预览">
            <EyeOutlined />
          </a>
        )}
        {!disabled && (
          <button
            type="button"
            className="fup__act-btn fup__act-btn--del"
            onClick={() => onRemove(item)}
            title="删除"
          >
            <DeleteOutlined />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 统一附件上传组件
 * @param {'compact'|'dragger'} [mode='compact'] 紧凑行内 / 大拖拽区
 * @param {'action'|'defer'|'base64'} [dataFlow='action'] 直传 / 暂存父提交 / 转码父提交
 * @param {string} [uploadUrl] 上传接口（默认 ExtendDoc）
 * @param {string} [accept] 允许文件类型
 * @param {number} [maxSize=10] 单文件 MB 上限
 * @param {number} [maxCount=1] 最大文件数
 * @param {boolean} [multiple=false] 多选
 * @param {boolean} [disabled=false]
 * @param {Array} [value=[]] 受控文件列表 [{uid,name,fileId,url?,status,fileBase64?,originFileObj?}]
 * @param {(list:Array)=>void} onChange 列表变化回调
 * @param {boolean} [enableImagePreview=true] 图片类显示缩略图
 */
export default function FileUploader({
  mode = 'compact',
  dataFlow = 'action',
  uploadUrl = `${EXDOC}ExtendDoc/`,
  accept,
  maxSize = 10,
  maxCount = 1,
  multiple = false,
  disabled = false,
  value = [],
  onChange,
  enableImagePreview = true,
}) {
  const { message } = App.useApp();
  // 内部展示列表（半受控：value 作外部更新源）
  const [files, setFiles] = useState(value || []);
  // 最新列表引用（并发 beforeUpload 累积安全）
  const filesRef = useRef(files);
  filesRef.current = files;
  // action 模式上传中被删除的 uid — 阻止 antd XHR 完成后幽灵回流
  const removedUidsRef = useRef(new Set());

  useEffect(() => {
    setFiles(value || []);
  }, [value]);

  // 卸载时释放所有本地 blob 预览 URL，防内存泄漏
  useEffect(
    () => () => {
      filesRef.current.forEach((f) => f._localUrl && URL.revokeObjectURL(f._localUrl));
    },
    []
  );

  const applyConstraint = (list) => (!multiple && maxCount === 1 ? list.slice(-1) : list);

  // 统一对外吐出 + 内部同步；listOrFn 可为列表或 (prev)=>列表（并发累积安全）
  const emit = (listOrFn) => {
    const base = typeof listOrFn === 'function' ? listOrFn(filesRef.current) : listOrFn;
    const next = applyConstraint(base);
    filesRef.current = next;
    setFiles(next);
    onChange?.(next);
  };

  // 体积校验
  const checkSize = (file) => {
    if (file.size / 1024 / 1024 > maxSize) {
      message.error(`文件 ${file.name} 超过 ${maxSize}MB 限制`);
      return false;
    }
    return true;
  };

  // beforeUpload：defer/base64 暂存交父，action 放行 antd 直传
  const beforeUpload = async (file) => {
    if (!checkSize(file)) return Upload.LIST_IGNORE;
    if (dataFlow === 'base64') {
      try {
        const fileBase64 = await toBase64(file);
        const item = { uid: file.uid, name: file.name, fileId: '', fileBase64, status: 'done', _localUrl: URL.createObjectURL(file) };
        emit((prev) => (multiple ? [...prev, item] : [item]));
      } catch {
        message.error('文件读取失败');
      }
      return false;
    }
    if (dataFlow === 'defer') {
      const item = { uid: file.uid, name: file.name, fileId: '', originFileObj: file, status: 'pending', _localUrl: URL.createObjectURL(file) };
      emit((prev) => (multiple ? [...prev, item] : [item]));
      return false;
    }
    return true; // action 模式：交 antd action 直传 ExtendDoc
  };

  // action 模式 antd 上传状态变化 → 映射回 FileItem 吐出（过滤已删除的幽灵项）
  const handleAntdChange = ({ fileList }) => {
    const mapped = fileList
      .filter((f) => !removedUidsRef.current.has(f.uid))
      .map((f) => {
        if (f.response) {
          const fileId = f.response.Id ?? f.response.fileId ?? '';
          return {
            uid: f.uid,
            name: f.response.FullName ?? f.name,
            fileId,
            status: 'done',
            url: fileId ? `${EXDOC}ExtendDoc/Download/${fileId}` : undefined,
          };
        }
        return { uid: f.uid, name: f.name, fileId: '', status: f.status };
      });
    emit(mapped);
  };

  const handleRemove = (item) => {
    if (item._localUrl) URL.revokeObjectURL(item._localUrl);
    // action 模式上传中删除：标记 uid，防止 antd 上传完成后回流
    if (dataFlow === 'action' && item.status === 'uploading') {
      removedUidsRef.current.add(item.uid);
    }
    emit((prev) => prev.filter((f) => f.uid !== item.uid));
  };

  const uploadProps = {
    name: 'file',
    accept,
    multiple,
    maxCount,
    disabled,
    showUploadList: false,
    beforeUpload,
  };
  if (dataFlow === 'action') {
    uploadProps.action = uploadUrl;
    uploadProps.onChange = handleAntdChange;
    // action 模式 fileList 受控映射，保留 antd 上传中状态
    uploadProps.fileList = files.map((v) => ({
      uid: v.uid,
      name: v.name,
      status: v.status === 'pending' ? 'done' : v.status,
      response: v.fileId ? { Id: v.fileId, FullName: v.name } : undefined,
    }));
  }

  // 排除上传失败项，失败后仍可继续选文件重传
  const validCount = files.filter((f) => f.status !== 'error').length;
  const canAdd = !disabled && (multiple || validCount < (maxCount || 1));

  return (
    <div className={`fup fup--${mode}`}>
      {canAdd && (
        <Upload.Dragger {...uploadProps} className={`fup__dragger fup__dragger--${mode}`}>
          {mode === 'dragger' ? (
            <div className="fup__drop-area">
              <InboxOutlined className="fup__drop-icon" />
              <div className="fup__drop-text">
                拖拽文件到此处，或 <span className="fup__drop-link">点击选择</span>
              </div>
              <div className="fup__drop-hint">
                {accept ? `支持 ${accept}` : '支持各类文件'}，单文件 ≤ {maxSize}MB{multiple ? '，可多选' : ''}
              </div>
            </div>
          ) : (
            <div className="fup__drop-compact">
              <UploadOutlined />
              <span>点击或拖拽上传</span>
            </div>
          )}
        </Upload.Dragger>
      )}
      {files.length > 0 && (
        <div className={`fup__filelist fup__filelist--${mode}`}>
          {files.map((f) => (
            <FileCard
              key={f.uid}
              item={f}
              onRemove={handleRemove}
              enableImagePreview={enableImagePreview}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}
