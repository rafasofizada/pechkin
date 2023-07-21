# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2023-07-21

### Changed
- Cleanup process on request errors. Previously, only `request.unpipe()` was called on error. Now, an approach inspired by Multer source code was taken:
  - Unpipe the request stream from the parser
  - Remove all event listeners from the parser
  - **Resume** the request stream.
    
    - Why `req.resume()` and not `req.pause()`?
      * Pausing causes the internal Node.js TCP stack buffers to overflow, backpressure is propagated
  through the network, TCP congestion control kicks in, and may probably slow down the network (?)
      * Resuming doesn't consume any additional memory, and any CPU usage is negligible (networks are much slower than CPUs)

    - Why not `req.destroy()`?
      * I'm actually not sure. I think it's better to leave it up to the user to decide when and how to close the request. A simple `res.end()` should be enough.

## [2.0.1] - 2023-07-13

Update documentation for NPM.

## [2.0.0] - 2023-07-13

**For migration guide**, check comments on [file system](./examples/fs.js) and [S3](./examples/s3.js) upload [examples]((./examples)).

### Major commits:

- [Fix #2: ByteLengthTruncateStream refactoring](https://github.com/rafasofizada/pechkin/commit/37029d9659a3d2f840f2b34584ce3439538cc7c9)
- [Fix #2 cont.: remove byteLength event & promise](https://github.com/rafasofizada/pechkin/commit/ab66b47aedbd9952cc9d920d84870dc2806531d0)

### Added

- [`bytesWritten`, `bytesRead`, `truncated` getters](https://github.com/rafasofizada/pechkin/commit/ab66b47aedbd9952cc9d920d84870dc2806531d0) to `ByteLengthTruncateStream` class.

### Fixed

- [`maxFileByteLength` error handling](https://github.com/rafasofizada/pechkin/issues/2#top): `maxFileByteLength` now works as expected and throws an error when the file size exceeds the limit. `ByteLengthTruncateStream` now directly throws the `maxFileByteLength` `Error`. Previously, _only_ the `byteLength` property (the event handlers inside the promise creation) were responsible for throwing the length limit error; which meants that if you don't use and properly error-handle the `byteLength` promise, in case file byte length limit was reached, it'd trigger an unhandled promise rejection. 

### Removed

- [`Pechkin.File.byteLength`](https://github.com/rafasofizada/pechkin/commit/ab66b47aedbd9952cc9d920d84870dc2806531d0)
- [`ByteLengthTruncateStream.byteLengthEvent`](https://github.com/rafasofizada/pechkin/commit/37029d9659a3d2f840f2b34584ce3439538cc7c9)
