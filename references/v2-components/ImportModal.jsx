// 统一 Excel 导入 Modal — 下载模板 → 点击/拖拽上传 → 后端解析(默认)或前端 XLSX 解析(stock 特例)
// 外壳移植自 SYSV2 MDM ImportModal，去两步 hash 框架(D4)，接 HC 现有 import endpoint。
// 契约见 docs/superpowers/specs/2026-06-01-hc-upload-component-unify/contract-lock-uploader.md
import { useState } from 'react';
import { Modal, Upload, Button, App, Alert, Table, Space, Spin } from 'antd';
import { InboxOutlined, DownloadOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';

const { Dragger } = Upload;

export default function ImportModal({
  open,
  title = '数据导入',
  accept = '.xlsx,.xls',
  maxSize = 5,
  parseMode = 'backend', // backend=后端解析 / frontend=前端 XLSX 解析
  onImport, // backend:(file)=>Promise / frontend:(rows)=>Promise
  templateSource, // {type:'href',url} | {type:'api',fn} | {type:'generate',fn}
  columnMapping, // 仅 frontend：Excel 列名→字段名
  previewColumns, // 仅 frontend：解析预览表列
  onClose,
  onSuccess,
}) {
  const { message } = App.useApp();
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState([]);

  const reset = () => {
    setFile(null);
    setRows([]);
    setErrors([]);
  };
  const handleClose = () => {
    reset();
    onClose?.();
  };

  // 下载模板（静态链接 / 后端接口 / 前端生成 三态）
  const downloadTemplate = async () => {
    if (!templateSource) return;
    try {
      if (templateSource.type === 'href') {
        const a = document.createElement('a');
        a.href = templateSource.url;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else if (templateSource.type === 'api' || templateSource.type === 'generate') {
        await templateSource.fn();
      }
    } catch {
      message.error('模板下载失败');
    }
  };

  // 选文件（frontend 即时解析；backend 暂存）
  const beforeUpload = (f) => {
    if (f.size / 1024 / 1024 > maxSize) {
      message.error(`文件超过 ${maxSize}MB 限制`);
      return Upload.LIST_IGNORE;
    }
    if (parseMode === 'frontend') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(ws, { header: 1 });
          if (json.length < 2) {
            message.error('Excel 至少需表头 + 1 行数据');
            return;
          }
          const headers = json[0];
          // 校验模板列名是否命中映射，0 命中说明模板不对（避免静默导入空数据）
          if (columnMapping && headers.filter((h) => columnMapping[h]).length === 0) {
            message.error('模板列名不匹配，请使用下载的最新模板');
            return;
          }
          const parsed = json
            .slice(1)
            .filter((r) => r.some((c) => c !== undefined && c !== ''))
            .map((r) => {
              const item = {};
              headers.forEach((h, i) => {
                const fld = columnMapping?.[h];
                if (fld) item[fld] = r[i];
              });
              return item;
            });
          setRows(parsed);
          message.success(`成功解析 ${parsed.length} 条数据`);
        } catch {
          message.error('解析 Excel 失败，请检查文件格式');
        }
      };
      reader.readAsArrayBuffer(f);
    } else {
      setFile(f);
    }
    return false; // 阻止 antd 自动上传
  };

  // 确认导入（调父组件传入的现有 import 逻辑）
  const handleImport = async () => {
    setLoading(true);
    setErrors([]);
    try {
      const payload = parseMode === 'frontend' ? rows : file;
      const res = await onImport?.(payload);
      const errs = res?.errors ?? res?.Errors ?? [];
      if (errs.length) {
        setErrors(errs);
        message.warning(`导入完成，其中 ${errs.length} 条有误`);
      } else {
        const cnt = res?.insertedCount ?? res?.successCount ?? res?.SuccessCount;
        message.success(cnt != null ? `导入成功 ${cnt} 条` : '导入成功');
        onSuccess?.();
        handleClose();
      }
    } catch (err) {
      message.error(err?.message || '导入失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const canImport = parseMode === 'frontend' ? rows.length > 0 : !!file;

  return (
    <Modal
      title={title}
      open={open}
      onCancel={handleClose}
      width={720}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={handleClose}>取消</Button>
          <Button type="primary" loading={loading} disabled={!canImport} onClick={handleImport}>
            确认导入
          </Button>
        </Space>
      }
    >
      <Spin spinning={loading}>
        {templateSource && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={
              <Button type="link" size="small" icon={<DownloadOutlined />} onClick={downloadTemplate}>
                下载导入模板
              </Button>
            }
          />
        )}
        <Dragger
          accept={accept}
          maxCount={1}
          beforeUpload={beforeUpload}
          onChange={({ fileList }) => {
            if (parseMode === 'backend' && fileList.length === 0) setFile(null);
          }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽 Excel 文件到此区域上传</p>
          <p className="ant-upload-hint">
            支持 {accept}，单文件 ≤ {maxSize}MB
          </p>
        </Dragger>
        {parseMode === 'frontend' && rows.length > 0 && previewColumns && (
          <Table
            style={{ marginTop: 16 }}
            columns={previewColumns}
            dataSource={rows}
            rowKey={(_, i) => i}
            size="small"
            scroll={{ y: 320 }}
            pagination={false}
          />
        )}
        {errors.length > 0 && (
          <Table
            style={{ marginTop: 16 }}
            dataSource={errors}
            rowKey={(_, i) => i}
            size="small"
            pagination={{ pageSize: 10 }}
            columns={[
              { title: '行', dataIndex: 'rowNumber', width: 80, render: (v, r) => v ?? r.Row ?? r.row ?? '—' },
              { title: '原因', render: (_, r) => r.reason ?? r.Message ?? r.message ?? '—' },
            ]}
          />
        )}
      </Spin>
    </Modal>
  );
}
