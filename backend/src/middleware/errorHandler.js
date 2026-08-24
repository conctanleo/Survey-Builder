export function errorHandler(err, req, res, next) {
  console.error('Error:', err);

  // Multer 文件上传错误
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: '文件大小超出限制（最大10MB）' });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: '不支持的文件类型' });
  }

  // 其他错误
  const statusCode = err.statusCode || 500;
  // 5xx 不回显内部错误细节（可能包含绝对路径、SQLite 报错等），只记服务端日志
  const message = statusCode >= 500 ? '服务器内部错误' : (err.message || '请求失败');

  res.status(statusCode).json({ error: message });
}