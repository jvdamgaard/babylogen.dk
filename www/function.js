/** Google Could Function **/

exports.deployHTTP = function deployHTTP (req, res) {
  res.send(`Hello ${req.body.name || 'World'}!`)
}
