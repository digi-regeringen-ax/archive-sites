# Website archiver

This script is used for archiving a website by breaking it into chunks, storing the chunks and images in subdirectories, and optionally creating a PDF file containing all pages. 

## Installation
Install the packages with 

`npm i`

## Usage

You can run the script using Node.js with various command-line arguments. The script accepts multiple options to customize the archiving process.

### Example

```bash
node script.js --url=example.com --chunk_size=100 --images_path=assets/images --chunks_path=output/chunks --all_pages_filename=complete.pdf
```

### Parameters

| Option            | Alias | Type    | Default        | Description                                                |
|-------------------|-------|---------|----------------|------------------------------------------------------------|
| `--url`           | `-u`  | String  | *Required*      | URL of the site to archive (without `http(s)://`). Mandatory |
| `--chunk_size`    | `-c`  | Number  | `50`           | Size of the chunks.                                              |
| `--images_path`   | `-i`  | String  | `__png__`       | Name of the subdirectory where to store PNGs.                   |
| `--chunks_path`   | `-cp` | String  | `__chunks__`    | Name of the subdirectory where to store the chunks.             |
| `--all_pages_filename` | `-a` | String | `all_pages.pdf` | Name of the file that holds all the pages as a PDF.          |

### Error Handling

If the `--url` parameter is not provided, the script will output the following error message and terminate:
 
```bash
  No URL given
```
### Output

The script logs the passed parameters to the console:

```bash
Parameters:  {
  url: 'example.com',
  chunk_size: 50,
  images_path: '__png__',
  chunks_path: '__chunks__',
  all_pages_filename: 'all_pages.pdf'
}
```

## Exit Conditions

The script will terminate if no `--url` is provided.

## License

MIT License


