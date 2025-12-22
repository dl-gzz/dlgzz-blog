Node.js快速入门
更新时间：2025-06-13 16:11:32
产品详情
我的收藏
本文介绍如何在Node.js环境中快速使用OSS服务，包括查看存储空间（Bucket） 列表、上传文件（Object）等。

前提条件
已完成初始化。具体操作，请参见初始化。

查看存储空间列表
以下代码用于查看存储空间列表。

 
const OSS = require('ali-oss');

const client = new OSS({
  // yourregion填写Bucket所在地域。以华东1（杭州）为例，Region填写为oss-cn-hangzhou。
  region: 'yourregion',
  // 从环境变量中获取访问凭证。运行本代码示例之前，请确保已设置环境变量OSS_ACCESS_KEY_ID和OSS_ACCESS_KEY_SECRET。
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  authorizationV4: true,
  // yourBucketName填写Bucket名称。
  bucket: 'yourBucketName',
});

async function listBuckets() {
  try {
    // 列举当前账号所有地域下的存储空间。
    const result = await client.listBuckets();
    console.log(result);
  } catch (err) {
    console.log(err);
  }
}

listBuckets();
查看文件列表
以下代码用于查看文件列表。

 
const OSS = require('ali-oss');

const client = new OSS({
  // yourregion填写Bucket所在地域。以华东1（杭州）为例，Region填写为oss-cn-hangzhou。
  region: 'yourregion',
  // 从环境变量中获取访问凭证。运行本代码示例之前，请确保已设置环境变量OSS_ACCESS_KEY_ID和OSS_ACCESS_KEY_SECRET。
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  authorizationV4: true,
  // yourbucketname填写存储空间名称。
  bucket: 'yourbucketname'
});

async function list () {
    // 不带任何参数，默认最多返回100个文件。
    const result = await client.list();
    console.log(result);
}

list();
上传文件
以下代码用于上传单个文件。

 
const OSS = require('ali-oss')
const path=require("path")

const client = new OSS({
  // yourregion填写Bucket所在地域。以华东1（杭州）为例，Region填写为oss-cn-hangzhou。
  region: 'yourregion',
  // 从环境变量中获取访问凭证。运行本代码示例之前，请确保已设置环境变量OSS_ACCESS_KEY_ID和OSS_ACCESS_KEY_SECRET。
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  authorizationV4: true,
  // 填写Bucket名称。
  bucket: 'examplebucket',
});

// 自定义请求头
const headers = {
  // 指定Object的存储类型。
  'x-oss-storage-class': 'Standard',
  // 指定Object的访问权限。
  'x-oss-object-acl': 'private',
  // 通过文件URL访问文件时，指定以附件形式下载文件，下载后的文件名称定义为example.txt。
  'Content-Disposition': 'attachment; filename="example.txt"',
  // 设置Object的标签，可同时设置多个标签。
  'x-oss-tagging': 'Tag1=1&Tag2=2',
  // 指定PutObject操作时是否覆盖同名目标Object。此处设置为true，表示禁止覆盖同名Object。
  'x-oss-forbid-overwrite': 'true',
};

async function put () {
  try {
    // 填写OSS文件完整路径和本地文件的完整路径。OSS文件完整路径中不能包含Bucket名称。
    // 如果本地文件的完整路径中未指定本地路径，则默认从示例程序所属项目对应本地路径中上传文件。
    const result = await client.put('exampleobject.txt', path.normalize('D:\\localpath\\examplefile.txt')
    // 自定义headers
    ,{headers}
    );
    console.log(result);
  } catch (e) {
    console.log(e);
  }
}

put();
下载文件
以下代码用于下载单个文件。

 
const OSS = require('ali-oss');

const client = new OSS({
  // yourregion填写Bucket所在地域。以华东1（杭州）为例，Region填写为oss-cn-hangzhou。
  region: 'yourRegion',
  // 从环境变量中获取访问凭证。运行本代码示例之前，请确保已设置环境变量OSS_ACCESS_KEY_ID和OSS_ACCESS_KEY_SECRET。
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  authorizationV4: true,
  // 填写Bucket名称。
  bucket: 'examplebucket'
});

async function get () {
  try {
    // 填写Object完整路径和本地文件的完整路径。Object完整路径中不能包含Bucket名称。
    // 如果指定的本地文件存在会覆盖，不存在则新建。
    // 如果未指定本地路径，则下载后的文件默认保存到示例程序所属项目对应本地路径中。
    const result = await client.get('exampleobject.txt', 'D:\\localpath\\examplefile.txt');
    console.log(result);
  } catch (e) {
    console.log(e);
  }
}

get(); 
删除单个文件
以下代码用于删除单个文件。

 
const OSS = require('ali-oss');

const client = new OSS({
  // oss-cn-hangzhou填写Bucket所在地域。以华东1（杭州）为例，Region填写为oss-cn-hangzhou。
  region: 'oss-cn-hangzhou',
  // 从环境变量中获取访问凭证。运行本代码示例之前，请确保已设置环境变量OSS_ACCESS_KEY_ID和OSS_ACCESS_KEY_SECRET。
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  authorizationV4: true,
  // 填写Bucket名称。
  bucket: 'examplebucket',
});

async function deleteObject() {
  try {
    // 填写Object完整路径。Object完整路径中不能包含Bucket名称。
    const result = await client.delete('exampleobject.txt');
    console.log(result);
  } catch (error) {
    console.log(error);
  }
}

deleteObject();
相关文档
查看存储空间列表

关于查看存储空间列表的完整示例代码，请参见GitHub示例。

关于查看存储空间列表的API接口说明，请参见ListBuckets（GetService）。

查看文件列表

关于查看文件列表的完整示例代码，请参见GitHub示例。

关于查看文件列表的API接口说明，请参见GetBucket (ListObjects)。

上传文件

关于上传文件的完整示例代码，请参见GitHub示例。

关于上传文件的API接口说明，请参见PutObject。

下载文件

关于下载文件的完整示例代码，请参见GitHub示例。

关于下载文件的API接口说明，请参见GetObject。

删除文件

关于删除单个文件的完整示例代码，请参见GitHub示例。

关于删除单个文件的API接口说明，请参见DeleteObject。