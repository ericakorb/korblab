# korblab

### Team Photos

Dimensions: 230 w x 320 h

### Publications

It's not great that there's HTML for the bolding of Erica's name in the header material of each publication, but this exists because Liquid templates render content inside paragraph tags, which messes up the formatting. As a solution, I made an "authors" property that's rendered as-is, so I can control the formatting of each publication. However, the hack seems worth it to maintain consistency of formatting in citations.

Maybe someday I'll figure out a better solution for this...someday...

Use the special character `&#58;` to represent colons in titles

### Notes on the order of items in collections

#### Team Members

Team members are sorted in ascending order, with lab members falling in ranges depending on their seniority.

* Erica: 1
* Staff: 2 - 10
* Postdocs: 11 - 20
* Grad students: 21 - 30
* Undergrads: 31 - 40
* High schoolers (if they ever make it onto the website...): 41+

#### Alumni

Alumni are sorted in descending order, with the largest order index corresponding to the most-recently departed.

#### Publications

Publications are ordered in descending order - the largest order index corresponding to the most recent publication.

#### Development Workflow

Update the `_config.yml` file: set `baseURL: ""`. When ready to build for prod, set this field back to `https://www.korblab.com`.

Run using `jekyll serve`. Note that we can do this because there is no Gemfile so we don't have to use Bundler.

To crop photos, you can set a fixed aspect ratio in GIMP to 23:32 (to reflect the pixel dimensions of the final photo). Then you crop to your selection, then scale the image down. Export the modified photo to the desired format.