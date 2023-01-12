import argv from 'process'
import axios from 'axios';

(async () => {
    const url = argv.argv[2]

    const response = await axios.get(url + "HelloWorldCronExample/handleQueryParams?name=john")
    console.log(response.data)


})();
 